from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.envelope import AckPayload, ClientHello, MessageEnvelope, MessageType


@dataclass
class ClientConnection:
    hello: ClientHello
    subscriptions: set[str] = field(default_factory=set)
    outbox: asyncio.Queue[MessageEnvelope] = field(default_factory=asyncio.Queue)
    connected_at: str = field(default_factory=utc_now_iso)
    last_seen_at: str = field(default_factory=utc_now_iso)
    message_count: int = 0

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

    async def disconnect(self, client_id: str) -> None:
        connection = self._clients.pop(client_id, None)
        if connection is not None:
            for topic in connection.subscriptions:
                subscribers = self._subscribers_by_topic.get(topic)
                if subscribers is None:
                    continue
                subscribers.discard(client_id)
                if not subscribers:
                    self._subscribers_by_topic.pop(topic, None)
        self._pending_acks = {
            pending: publisher_id
            for pending, publisher_id in self._pending_acks.items()
            if pending[1] != client_id and publisher_id != client_id
        }

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
            await connection.outbox.put(message)
            delivered.append(client_id)
            if message.requiresAck:
                self._pending_acks[(message.id, client_id)] = message.clientId
        return delivered

    async def acknowledge(self, message_id: str, client_id: str, status: str) -> bool:
        pending = (message_id, client_id)
        if pending not in self._pending_acks:
            return False
        publisher_id = self._pending_acks.pop(pending)
        publisher = self._clients.get(publisher_id)
        if publisher is not None:
            await publisher.outbox.put(
                MessageEnvelope(
                    type=MessageType.ACK,
                    clientId="hub",
                    correlationId=message_id,
                    payload=AckPayload(
                        messageId=message_id,
                        status=status,
                        detail=None,
                    ).model_dump(mode="json")
                    | {"clientId": client_id},
                )
            )
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
