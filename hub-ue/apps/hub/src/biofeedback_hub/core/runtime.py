from __future__ import annotations

import asyncio

from pydantic import ValidationError

from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.core.broker import ClientConnection, TopicBroker
from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.schemas.envelope import (
    AckPayload,
    MessageEnvelope,
    MessageType,
    SystemPingPayload,
    SystemPongPayload,
    TopicList,
    make_error,
)
from biofeedback_hub.schemas.topics import Topic

SENSOR_MANAGER_CLIENT_ID = "sensor-manager"


class HubRuntime:
    def __init__(self, broker: TopicBroker, session_logger: JsonlSessionLogger) -> None:
        self.broker = broker
        self.session_logger = session_logger
        self._active_experience_run_id: str | None = None
        self._ended_sensor_runs: set[str] = set()
        self._closing_experience_run_ids: set[str] = set()
        self._lifecycle_lock = asyncio.Lock()

    async def handle_message(
        self,
        message: MessageEnvelope,
        authenticated_client_id: str | None = None,
    ) -> list[str] | bool:
        if authenticated_client_id is not None:
            if message.clientId != authenticated_client_id:
                return await self._reject_client_message(
                    authenticated_client_id,
                    message,
                    "client_id_mismatch",
                    "Message clientId must match the authenticated client.",
                )
            if message.topic == Topic.SYSTEM_PONG.value:
                return await self._reject_client_message(
                    authenticated_client_id,
                    message,
                    "system_pong_reserved",
                    "system.pong can only be published by the Hub.",
                )
            if message.topic == Topic.SYSTEM_PING.value and message.type != MessageType.PUBLISH:
                return await self._reject_client_message(
                    authenticated_client_id,
                    message,
                    "invalid_system_ping",
                    "system.ping must be a publish message.",
                )
            if (
                message.type == MessageType.PUBLISH
                and message.topic == Topic.LSL_RAW.value
                and authenticated_client_id != SENSOR_MANAGER_CLIENT_ID
            ):
                return await self._reject_client_message(
                    authenticated_client_id,
                    message,
                    "reserved_topic",
                    "lsl.raw is reserved for the managed Sensor Manager adapter.",
                )

        stamped = self._stamp_received(message)
        self.broker.note_activity(stamped.clientId)

        if stamped.type == MessageType.SUBSCRIBE:
            request = TopicList.model_validate(stamped.payload)
            await self.broker.subscribe(
                stamped.clientId,
                request.topics,
            )
            await self._enqueue_message(stamped)
            return True

        if stamped.type == MessageType.UNSUBSCRIBE:
            request = TopicList.model_validate(stamped.payload)
            await self.broker.unsubscribe(
                stamped.clientId,
                request.topics,
            )
            await self._enqueue_message(stamped)
            return True

        if stamped.type == MessageType.PUBLISH:
            if stamped.topic == Topic.SYSTEM_PING.value:
                return await self._respond_to_system_ping(stamped, authenticated_client_id)
            if stamped.topic == Topic.EXPERIENCE_LIFECYCLE.value:
                async with self._lifecycle_lock:
                    lifecycle_rejection = self._validate_experience_lifecycle(stamped)
                    if lifecycle_rejection is not None:
                        if authenticated_client_id is not None:
                            code, error_message, error_detail = lifecycle_rejection
                            return await self._reject_client_message(
                                authenticated_client_id,
                                stamped,
                                code,
                                error_message,
                                error_detail=error_detail,
                            )
                        return []
                    if self._is_late_sensor_sample(stamped):
                        return []
                    run_id = stamped.payload.get("runId")
                    if (
                        stamped.payload.get("event") == "ended"
                        and isinstance(run_id, str)
                    ):
                        self._closing_experience_run_ids.add(run_id.strip())
                    try:
                        await self._persist_message(stamped)
                        self._commit_experience_lifecycle(stamped)
                        return await self.broker.publish(stamped)
                    finally:
                        if isinstance(run_id, str):
                            self._closing_experience_run_ids.discard(run_id.strip())
            if self._is_late_sensor_sample(stamped):
                return []
            if stamped.topic != Topic.SENSOR_PREVIEW.value:
                await self._enqueue_message(stamped)
            if stamped.clientId == SENSOR_MANAGER_CLIENT_ID:
                async with self._lifecycle_lock:
                    if self._is_late_sensor_sample(stamped):
                        return []
                    return await self.broker.publish(stamped)
            return await self.broker.publish(stamped)

        if stamped.type == MessageType.ACK:
            ack = AckPayload.model_validate(stamped.payload)
            # Do not deliver an ACK that the official JSONL cannot retain.
            # This also leaves the pending correlation intact for diagnosis
            # when the logger has entered its terminal error state.
            await self._persist_message(stamped)
            handled = await self.broker.acknowledge(
                ack.messageId,
                stamped.clientId,
                ack.status,
                ack.detail,
            )
            return handled

        await self._enqueue_message(stamped)
        return False

    def experience_lifecycle_snapshot(self) -> dict[str, str | None]:
        return {"activeRunId": self._active_experience_run_id}

    async def _enqueue_message(self, message: MessageEnvelope) -> None:
        await self.session_logger.enqueue_async(message)

    async def _persist_message(self, message: MessageEnvelope) -> None:
        # Lifecycle is low volume, so it waits for the dedicated writer to
        # confirm the JSONL record before changing authoritative run state or
        # broadcasting the transition. High-frequency telemetry keeps the
        # queue-admission path below to avoid coupling capture to disk latency.
        persist = getattr(self.session_logger, "persist_async", None)
        if persist is not None:
            await persist(message)
        else:
            await self._enqueue_message(message)

    def _stamp_received(self, message: MessageEnvelope) -> MessageEnvelope:
        # A producer cannot back-date Hub receipt. This field is used by latency
        # diagnostics and must describe the runtime processing boundary.
        return message.model_copy(update={"hubReceivedAt": utc_now_iso()})

    async def _respond_to_system_ping(
        self,
        message: MessageEnvelope,
        authenticated_client_id: str | None,
    ) -> list[str] | bool:
        if authenticated_client_id is None:
            return []

        try:
            ping = SystemPingPayload.model_validate(message.payload)
        except ValidationError:
            return await self._reject_client_message(
                authenticated_client_id,
                message,
                "invalid_system_ping",
                "system.ping payload must contain an integer sequence.",
            )

        connection = self.broker.get_client(authenticated_client_id)
        if connection is None:
            return []

        hub_responded_at = utc_now_iso()
        pong = MessageEnvelope(
            type=MessageType.PUBLISH,
            topic=Topic.SYSTEM_PONG,
            clientId="hub",
            correlationId=message.id,
            payload=SystemPongPayload(
                sequence=ping.sequence,
                pingHubReceivedAt=message.hubReceivedAt or hub_responded_at,
                hubRespondedAt=hub_responded_at,
            ).model_dump(mode="json"),
        )
        if await self._deliver_to_client(connection, pong):
            return [authenticated_client_id]
        return []

    async def _reject_client_message(
        self,
        authenticated_client_id: str,
        message: MessageEnvelope,
        code: str,
        error_message: str,
        error_detail: dict[str, object] | None = None,
    ) -> bool:
        connection = self.broker.get_client(authenticated_client_id)
        if connection is not None:
            await self._deliver_to_client(
                connection,
                make_error(
                    "hub",
                    code,
                    error_message,
                    correlation_id=message.id,
                    detail=error_detail,
                )
            )
        return False

    async def _deliver_to_client(self, connection: ClientConnection, message: MessageEnvelope) -> bool:
        accepted = await connection.outbox.put(message)
        if not accepted:
            await self.broker.disconnect(connection.client_id, expected_connection=connection)
        return accepted

    def _validate_experience_lifecycle(
        self,
        message: MessageEnvelope,
    ) -> tuple[str, str, dict[str, object]] | None:
        if message.topic != Topic.EXPERIENCE_LIFECYCLE.value:
            return None
        event = message.payload.get("event")
        run_id = message.payload.get("runId")
        if not isinstance(run_id, str) or not run_id.strip():
            return None
        run_id = run_id.strip()
        if event == "started":
            if run_id in self._ended_sensor_runs:
                return (
                    "lifecycle_already_ended",
                    "An ended experience run cannot be started again.",
                    self._lifecycle_error_detail(run_id, event),
                )
            if self._active_experience_run_id not in {None, run_id}:
                return (
                    "lifecycle_conflict",
                    "Another experience run is active.",
                    self._lifecycle_error_detail(run_id, event),
                )
            return None
        if event == "ended":
            if self._active_experience_run_id == run_id:
                return None
            if self._active_experience_run_id is None:
                return None
            return (
                "lifecycle_conflict",
                "Another experience run is active.",
                self._lifecycle_error_detail(run_id, event),
            )
        return None

    def _commit_experience_lifecycle(self, message: MessageEnvelope) -> None:
        event = message.payload.get("event")
        run_id = message.payload.get("runId")
        if not isinstance(run_id, str) or not run_id.strip():
            return
        run_id = run_id.strip()
        if event == "started":
            self._active_experience_run_id = run_id
        elif event == "ended":
            if self._active_experience_run_id in {None, run_id}:
                self._active_experience_run_id = None
                self._ended_sensor_runs.add(run_id)

    def _lifecycle_error_detail(self, run_id: str, event: object) -> dict[str, object]:
        return {
            "activeRunId": self._active_experience_run_id,
            "requestedRunId": run_id,
            "requestedEvent": event,
        }

    def _is_late_sensor_sample(self, message: MessageEnvelope) -> bool:
        if message.clientId != "sensor-manager" or message.topic == Topic.SENSOR_SESSION.value:
            return False
        run_id = message.payload.get("runId")
        normalized_run_id = run_id.strip() if isinstance(run_id, str) else None
        return normalized_run_id is not None and (
            normalized_run_id in self._ended_sensor_runs
            or normalized_run_id in self._closing_experience_run_ids
        )
