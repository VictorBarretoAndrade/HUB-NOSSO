import asyncio
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from biofeedback_hub.config import HubConfig
from biofeedback_hub.core.broker import TopicBroker
from biofeedback_hub.core.runtime import HubRuntime
from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.main import create_app
from biofeedback_hub.schemas.envelope import (
    ClientHello,
    ClientRole,
    MessageEnvelope,
    MessageType,
    SystemPingPayload,
)
from biofeedback_hub.schemas.topics import Topic


class SystemPingSchemaTest(unittest.TestCase):
    def test_system_probe_topics_are_official(self) -> None:
        self.assertEqual(Topic.SYSTEM_PING.value, "system.ping")
        self.assertEqual(Topic.SYSTEM_PONG.value, "system.pong")

    def test_ping_sequence_must_be_an_integer(self) -> None:
        self.assertEqual(SystemPingPayload.model_validate({"sequence": 42}).sequence, 42)

        for payload in ({}, {"sequence": "42"}, {"sequence": 42.0}, {"sequence": True}):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                SystemPingPayload.model_validate(payload)


class SystemPingRuntimeTest(unittest.IsolatedAsyncioTestCase):
    async def test_stale_disconnect_does_not_remove_reconnected_client(self) -> None:
        broker = TopicBroker()
        first = await broker.connect(ClientHello(clientId="unreal", role=ClientRole.UNREAL))
        second = await broker.connect(ClientHello(clientId="unreal", role=ClientRole.UNREAL))
        await broker.subscribe("unreal", {Topic.SYSTEM_PONG.value})

        disconnected = await broker.disconnect("unreal", expected_connection=first)

        self.assertFalse(disconnected)
        self.assertIs(broker.get_client("unreal"), second)
        self.assertEqual(second.subscriptions, {Topic.SYSTEM_PONG.value})

    async def test_ping_returns_a_direct_ephemeral_pong(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            logger = JsonlSessionLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            unreal = await broker.connect(ClientHello(clientId="unreal", role=ClientRole.UNREAL))
            observer = await broker.connect(ClientHello(clientId="observer", role=ClientRole.DASHBOARD))
            await broker.subscribe(
                "observer",
                {Topic.SYSTEM_PING.value, Topic.SYSTEM_PONG.value},
            )
            ping = MessageEnvelope(
                id="ping-42",
                type=MessageType.PUBLISH,
                clientId="unreal",
                topic=Topic.SYSTEM_PING,
                requiresAck=True,
                hubReceivedAt="client-supplied",
                payload={"sequence": 42},
            )

            delivered = await runtime.handle_message(
                ping,
                authenticated_client_id="unreal",
            )

            self.assertEqual(delivered, ["unreal"])
            pong = await asyncio.wait_for(unreal.outbox.get(), timeout=1)
            self.assertEqual(pong.type, MessageType.PUBLISH)
            self.assertEqual(pong.topic, Topic.SYSTEM_PONG.value)
            self.assertEqual(pong.clientId, "hub")
            self.assertEqual(pong.correlationId, ping.id)
            self.assertEqual(pong.payload["sequence"], 42)
            self.assertNotEqual(pong.payload["pingHubReceivedAt"], "client-supplied")
            self.assertLessEqual(
                _parse_timestamp(pong.payload["pingHubReceivedAt"]),
                _parse_timestamp(pong.payload["hubRespondedAt"]),
            )
            self.assertFalse(pong.requiresAck)
            self.assertTrue(observer.outbox.empty())
            self.assertEqual(broker.pending_ack_count(), 0)
            self.assertFalse(logger.path.exists())


class SystemPingWebSocketTest(unittest.IsolatedAsyncioTestCase):
    async def test_external_client_cannot_claim_internal_sensor_manager_identity(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            app = create_app(
                HubConfig(
                    log_dir=Path(tmpdir),
                    session_id="session-test",
                    cors_origins=[],
                )
            )

            async with AsgiWebSocket(app) as socket:
                hello = MessageEnvelope(
                    type=MessageType.HELLO,
                    clientId="sensor-manager",
                    payload=ClientHello(
                        clientId="sensor-manager",
                        role=ClientRole.SYSTEM,
                    ).model_dump(mode="json"),
                )
                await socket.send(hello)
                error = await socket.receive()

                self.assertEqual(error.type, MessageType.ERROR)
                self.assertEqual(error.payload["code"], "reserved_client_id")
                self.assertEqual(error.correlationId, hello.id)

    async def test_hello_envelope_and_payload_must_use_the_same_identity(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            app = create_app(
                HubConfig(
                    log_dir=Path(tmpdir),
                    session_id="session-test",
                    cors_origins=[],
                )
            )

            async with AsgiWebSocket(app) as legitimate:
                await legitimate.send(
                    MessageEnvelope(
                        type=MessageType.HELLO,
                        clientId="authenticated-client",
                        payload=ClientHello(
                            clientId="authenticated-client",
                            role=ClientRole.UNREAL,
                        ).model_dump(mode="json"),
                    )
                )

                async with AsgiWebSocket(app) as rejected:
                    hello = MessageEnvelope(
                        type=MessageType.HELLO,
                        clientId="audit-alias",
                        payload=ClientHello(
                            clientId="authenticated-client",
                            role=ClientRole.UNREAL,
                        ).model_dump(mode="json"),
                    )
                    await rejected.send(hello)
                    error = await rejected.receive()

                    self.assertEqual(error.type, MessageType.ERROR)
                    self.assertEqual(error.correlationId, hello.id)
                    self.assertEqual(error.payload["code"], "hello_client_id_mismatch")

                valid_ping = MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId="authenticated-client",
                    topic=Topic.SYSTEM_PING,
                    payload={"sequence": 7},
                )
                await legitimate.send(valid_ping)
                pong = await legitimate.receive()
                self.assertEqual(pong.topic, Topic.SYSTEM_PONG.value)
                self.assertEqual(pong.correlationId, valid_ping.id)

    async def test_rejections_keep_the_authenticated_socket_open(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            log_dir = Path(tmpdir)
            app = create_app(
                HubConfig(
                    log_dir=log_dir,
                    session_id="session-test",
                    cors_origins=[],
                )
            )

            async with AsgiWebSocket(app) as socket:
                await socket.send(
                    MessageEnvelope(
                        type=MessageType.HELLO,
                        clientId="unreal",
                        payload=ClientHello(
                            clientId="unreal",
                            role=ClientRole.UNREAL,
                        ).model_dump(mode="json"),
                    )
                )

                mismatched = MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId="another-client",
                    topic=Topic.SYSTEM_PING,
                    payload={"sequence": 1},
                )
                await socket.send(mismatched)
                mismatch_error = await socket.receive()
                self.assertEqual(mismatch_error.type, MessageType.ERROR)
                self.assertEqual(mismatch_error.correlationId, mismatched.id)
                self.assertEqual(mismatch_error.payload["code"], "client_id_mismatch")

                client_pong = MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId="unreal",
                    topic=Topic.SYSTEM_PONG,
                    payload={"sequence": 2},
                )
                await socket.send(client_pong)
                pong_error = await socket.receive()
                self.assertEqual(pong_error.type, MessageType.ERROR)
                self.assertEqual(pong_error.correlationId, client_pong.id)
                self.assertEqual(pong_error.payload["code"], "system_pong_reserved")

                invalid_ping = MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId="unreal",
                    topic=Topic.SYSTEM_PING,
                    payload={"sequence": "3"},
                )
                await socket.send(invalid_ping)
                validation_error = await socket.receive()
                self.assertEqual(validation_error.type, MessageType.ERROR)
                self.assertEqual(validation_error.correlationId, invalid_ping.id)
                self.assertEqual(validation_error.payload["code"], "invalid_system_ping")

                valid_ping = MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId="unreal",
                    topic=Topic.SYSTEM_PING,
                    requiresAck=True,
                    payload={"sequence": 4},
                )
                await socket.send(valid_ping)
                pong = await socket.receive()
                self.assertFalse(socket.done)
                self.assertEqual(pong.topic, Topic.SYSTEM_PONG.value)
                self.assertEqual(pong.correlationId, valid_ping.id)
                self.assertEqual(pong.payload["sequence"], 4)

            records = [
                json.loads(line)
                for line in (log_dir / "session-test.jsonl").read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual([record["type"] for record in records], [MessageType.HELLO.value])


class AsgiWebSocket:
    def __init__(self, app: Any) -> None:
        self.app = app
        self.incoming: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.outgoing: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.task: asyncio.Task[None] | None = None

    @property
    def done(self) -> bool:
        return self.task is not None and self.task.done()

    async def __aenter__(self) -> "AsgiWebSocket":
        self.task = asyncio.create_task(
            self.app(
                {
                    "type": "websocket",
                    "asgi": {"version": "3.0", "spec_version": "2.4"},
                    "http_version": "1.1",
                    "scheme": "ws",
                    "path": "/ws",
                    "raw_path": b"/ws",
                    "query_string": b"",
                    "headers": [(b"host", b"testserver")],
                    "client": ("127.0.0.1", 12345),
                    "server": ("testserver", 80),
                    "subprotocols": [],
                    "state": {},
                },
                self.incoming.get,
                self.outgoing.put,
            )
        )
        await self.incoming.put({"type": "websocket.connect"})
        accepted = await asyncio.wait_for(self.outgoing.get(), timeout=1)
        if accepted["type"] != "websocket.accept":
            raise AssertionError(f"Expected websocket.accept, got {accepted!r}")
        return self

    async def __aexit__(self, *_: object) -> None:
        if self.task is None or self.task.done():
            return
        await self.incoming.put({"type": "websocket.disconnect", "code": 1000})
        await asyncio.wait_for(self.task, timeout=1)

    async def send(self, message: MessageEnvelope) -> None:
        await self.incoming.put(
            {
                "type": "websocket.receive",
                "text": message.model_dump_json(),
            }
        )

    async def receive(self) -> MessageEnvelope:
        event = await asyncio.wait_for(self.outgoing.get(), timeout=1)
        if event["type"] != "websocket.send":
            raise AssertionError(f"Expected websocket.send, got {event!r}")
        return MessageEnvelope.model_validate_json(event["text"])


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


if __name__ == "__main__":
    unittest.main()
