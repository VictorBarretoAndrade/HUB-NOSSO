from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.envelope import AckPayload, ClientHello, MessageEnvelope, MessageType


LOSSY_DASHBOARD_TOPICS = frozenset({
    "hrv.raw",
    "sensor.preview",
    "unreal.state",
})


class OutboxClosed(RuntimeError):
    """Raised when a client outbox is closed or a slow client is evicted."""


class ClientOutbox:
    """Bounded client delivery queue with latest-value telemetry coalescing."""

    def __init__(
        self,
        *,
        role: str,
        max_reliable: int = 512,
        max_latest: int = 64,
    ) -> None:
        if max_reliable <= 0 or max_latest <= 0:
            raise ValueError("outbox limits must be greater than zero")
        self.role = role
        self.max_reliable = max_reliable
        self.max_latest = max_latest
        self._reliable: asyncio.Queue[MessageEnvelope] = asyncio.Queue(maxsize=max_reliable)
        self._latest: dict[str, MessageEnvelope] = {}
        self._condition = asyncio.Condition()
        self._closed = False
        self.close_reason: str | None = None
        self.coalesced_count = 0
        self.dropped_count = 0
        self.overflow_count = 0

    async def put(self, message: MessageEnvelope) -> bool:
        if self._closed:
            return False
        if self._can_coalesce(message):
            key = self._latest_key(message)
            async with self._condition:
                if self._closed:
                    return False
                if key in self._latest:
                    self.coalesced_count += 1
                elif len(self._latest) >= self.max_latest:
                    self._latest.pop(next(iter(self._latest)))
                    self.dropped_count += 1
                self._latest[key] = message
                self._condition.notify()
            return True

        try:
            self._reliable.put_nowait(message)
        except asyncio.QueueFull:
            self.overflow_count += 1
            await self.close("slow_consumer")
            return False
        async with self._condition:
            self._condition.notify()
        return True

    async def get(self) -> MessageEnvelope:
        while True:
            try:
                return self._reliable.get_nowait()
            except asyncio.QueueEmpty:
                pass
            async with self._condition:
                try:
                    return self._reliable.get_nowait()
                except asyncio.QueueEmpty:
                    if self._latest:
                        return self._latest.pop(next(iter(self._latest)))
                    if self._closed:
                        raise OutboxClosed(self.close_reason or "outbox closed")
                    await self._condition.wait()

    async def close(self, reason: str = "disconnected") -> None:
        async with self._condition:
            if self._closed:
                return
            self._closed = True
            self.close_reason = reason
            self._condition.notify_all()

    def qsize(self) -> int:
        return self._reliable.qsize() + len(self._latest)

    def empty(self) -> bool:
        return self.qsize() == 0

    def snapshot(self) -> dict[str, object]:
        return {
            "size": self.qsize(),
            "reliableSize": self._reliable.qsize(),
            "latestSize": len(self._latest),
            "maxReliable": self.max_reliable,
            "maxLatest": self.max_latest,
            "coalescedCount": self.coalesced_count,
            "droppedCount": self.dropped_count,
            "overflowCount": self.overflow_count,
            "closed": self._closed,
            "closeReason": self.close_reason,
        }

    def _can_coalesce(self, message: MessageEnvelope) -> bool:
        topic = message.topic.value if hasattr(message.topic, "value") else message.topic
        return self.role.lower() == "dashboard" and topic in LOSSY_DASHBOARD_TOPICS

    def _latest_key(self, message: MessageEnvelope) -> str:
        payload = message.payload
        identity = payload.get("sensorId") or payload.get("clientId") or message.clientId
        topic = message.topic.value if hasattr(message.topic, "value") else message.topic
        return f"{topic}:{identity}"


@dataclass
class ClientConnection:
    hello: ClientHello
    subscriptions: set[str] = field(default_factory=set)
    outbox: ClientOutbox = field(init=False)
    connected_at: str = field(default_factory=utc_now_iso)
    last_seen_at: str = field(default_factory=utc_now_iso)
    message_count: int = 0

    def __post_init__(self) -> None:
        self.outbox = ClientOutbox(role=self.hello.role)

    @property
    def client_id(self) -> str:
        return self.hello.clientId

    def note_message(self) -> None:
        self.message_count += 1
        self.last_seen_at = utc_now_iso()


class TopicBroker:
    def __init__(self) -> None:
        self._clients: dict[str, ClientConnection] = {}
        self._subscribers_by_topic: dict[str, set[str]] = {}
        self._pending_acks: dict[tuple[str, str], str] = {}

    async def connect(self, hello: ClientHello) -> ClientConnection:
        await self.disconnect(hello.clientId)
        connection = ClientConnection(hello=hello)
        self._clients[hello.clientId] = connection
        return connection

    async def disconnect(
        self,
        client_id: str,
        expected_connection: ClientConnection | None = None,
    ) -> bool:
        connection = self._clients.get(client_id)
        if expected_connection is not None and connection is not expected_connection:
            return False
        connection = self._clients.pop(client_id, None)
        if connection is not None:
            for topic in connection.subscriptions:
                subscribers = self._subscribers_by_topic.get(topic)
                if subscribers is None:
                    continue
                subscribers.discard(client_id)
                if not subscribers:
                    self._subscribers_by_topic.pop(topic, None)
            await connection.outbox.close("disconnected")
        self._pending_acks = {
            pending: publisher_id
            for pending, publisher_id in self._pending_acks.items()
            if pending[1] != client_id and publisher_id != client_id
        }
        return connection is not None

    async def subscribe(self, client_id: str, topics: set[str]) -> None:
        connection = self._require_client(client_id)
        for topic in topics:
            connection.subscriptions.add(topic)
            self._subscribers_by_topic.setdefault(topic, set()).add(client_id)

    async def unsubscribe(self, client_id: str, topics: set[str]) -> None:
        connection = self._require_client(client_id)
        for topic in topics:
            connection.subscriptions.discard(topic)
            subscribers = self._subscribers_by_topic.get(topic)
            if subscribers is None:
                continue
            subscribers.discard(client_id)
            if not subscribers:
                self._subscribers_by_topic.pop(topic, None)

    async def publish(self, message: MessageEnvelope) -> list[str]:
        if message.topic is None:
            return []

        topic = message.topic
        delivered: list[str] = []
        for client_id in sorted(self._subscribers_by_topic.get(topic, set())):
            connection = self._clients.get(client_id)
            if connection is None:
                continue
            accepted = await connection.outbox.put(message)
            if not accepted:
                await self.disconnect(client_id, expected_connection=connection)
                continue
            delivered.append(client_id)
            if message.requiresAck:
                self._pending_acks[(message.id, client_id)] = message.clientId
        return delivered

    async def acknowledge(self, message_id: str, client_id: str, status: str, detail: str | None = None) -> bool:
        pending = (message_id, client_id)
        if pending not in self._pending_acks:
            return False
        publisher_id = self._pending_acks.pop(pending)
        publisher = self._clients.get(publisher_id)
        if publisher is not None:
            accepted = await publisher.outbox.put(
                MessageEnvelope(
                    type=MessageType.ACK,
                    clientId="hub",
                    correlationId=message_id,
                    payload=AckPayload(
                        messageId=message_id,
                        status=status,
                        detail=detail,
                    ).model_dump(mode="json")
                    | {"clientId": client_id},
                )
            )
            if not accepted:
                await self.disconnect(publisher_id, expected_connection=publisher)
        return True

    def note_activity(self, client_id: str) -> None:
        connection = self._clients.get(client_id)
        if connection is not None:
            connection.note_message()

    def pending_ack_count(self) -> int:
        return len(self._pending_acks)

    def get_client(self, client_id: str) -> ClientConnection | None:
        return self._clients.get(client_id)

    def snapshot(self) -> dict[str, object]:
        clients = [
            self._connection_snapshot(connection)
            for connection in sorted(self._clients.values(), key=lambda item: item.client_id)
        ]
        pending_acks = [
            {
                "messageId": message_id,
                "recipientClientId": recipient_client_id,
                "publisherClientId": publisher_client_id,
            }
            for (message_id, recipient_client_id), publisher_client_id in sorted(
                self._pending_acks.items(),
                key=lambda item: (item[0][1], item[0][0]),
            )
        ]
        return {
            "clientCount": len(clients),
            "pendingAckCount": len(pending_acks),
            "clients": clients,
            "pendingAcks": pending_acks,
        }

    def _connection_snapshot(self, connection: ClientConnection) -> dict[str, object]:
        snapshot: dict[str, object] = {
            "clientId": connection.client_id,
            "role": connection.hello.role,
            "capabilities": sorted(connection.hello.capabilities),
            "subscriptions": sorted(connection.subscriptions),
            "outboxSize": connection.outbox.qsize(),
            "outbox": connection.outbox.snapshot(),
            "connectedAt": connection.connected_at,
            "lastSeenAt": connection.last_seen_at,
            "messageCount": connection.message_count,
        }
        if connection.hello.displayName:
            snapshot["displayName"] = connection.hello.displayName
        if connection.hello.deviceType:
            snapshot["deviceType"] = connection.hello.deviceType
        if connection.hello.metadata:
            snapshot["metadata"] = connection.hello.metadata
        return snapshot

    def _require_client(self, client_id: str) -> ClientConnection:
        connection = self._clients.get(client_id)
        if connection is None:
            raise KeyError(f"Unknown client: {client_id}")
        return connection
