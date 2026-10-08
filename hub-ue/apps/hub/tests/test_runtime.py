import asyncio
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

from biofeedback_hub.config import HubConfig
from biofeedback_hub.core.broker import TopicBroker
from biofeedback_hub.core.runtime import HubRuntime
from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.main import create_app
from biofeedback_hub.schemas.envelope import ClientHello, ClientRole, MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic


class HubRuntimeTest(unittest.IsolatedAsyncioTestCase):
    async def test_runtime_replaces_client_supplied_hub_receipt_timestamp(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            logger = JsonlSessionLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            observer = await broker.connect(ClientHello(clientId="dashboard", role=ClientRole.DASHBOARD))
            await broker.subscribe("dashboard", {Topic.SENSOR_STATUS.value})

            message = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="sensor-manager",
                topic=Topic.SENSOR_STATUS,
                hubReceivedAt="2000-01-01T00:00:00Z",
                payload={"event": "connected", "sensorId": "sim-hrv-1"},
            )
            await runtime.handle_message(message)
            delivered = await observer.outbox.get()

            self.assertNotEqual(delivered.hubReceivedAt, "2000-01-01T00:00:00Z")
            await logger.flush_async()
            record = json.loads(logger.path.read_text(encoding="utf-8").splitlines()[-1])
            self.assertEqual(record["hubReceivedAt"], delivered.hubReceivedAt)

    async def test_lifecycle_state_changes_only_after_logger_accepts_event(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            class RejectingLogger(JsonlSessionLogger):
                async def enqueue_async(self, message: MessageEnvelope) -> Path:
                    raise RuntimeError("background JSONL write failed")

                async def persist_async(self, message: MessageEnvelope) -> Path:
                    raise RuntimeError("background JSONL write failed")

            broker = TopicBroker()
            logger = RejectingLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            observer = await broker.connect(ClientHello(clientId="observer", role=ClientRole.LOGGER))
            await broker.subscribe("observer", {Topic.EXPERIENCE_LIFECYCLE.value})

            with self.assertRaisesRegex(RuntimeError, "background JSONL write failed"):
                await runtime.handle_message(
                    MessageEnvelope(
                        type=MessageType.PUBLISH,
                        clientId="dashboard-ui",
                        topic=Topic.EXPERIENCE_LIFECYCLE,
                        payload={"event": "started", "runId": "run-not-recorded"},
                    )
                )

            self.assertEqual(runtime.experience_lifecycle_snapshot(), {"activeRunId": None})
            self.assertTrue(observer.outbox.empty())

    async def test_lifecycle_is_not_broadcast_when_background_write_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            write_started = threading.Event()
            release_write = threading.Event()

            class FailingLogger(JsonlSessionLogger):
                def append(self, message: MessageEnvelope) -> Path:
                    write_started.set()
                    release_write.wait(timeout=1)
                    raise OSError("disk unavailable")

            broker = TopicBroker()
            logger = FailingLogger(
                Path(tmpdir),
                "session-test",
                background_writes=True,
            )
            runtime = HubRuntime(broker=broker, session_logger=logger)
            observer = await broker.connect(ClientHello(clientId="observer", role=ClientRole.LOGGER))
            await broker.subscribe("observer", {Topic.EXPERIENCE_LIFECYCLE.value})
            lifecycle = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="dashboard-ui",
                topic=Topic.EXPERIENCE_LIFECYCLE,
                payload={"event": "started", "runId": "run-not-recorded"},
            )

            task = asyncio.create_task(runtime.handle_message(lifecycle))
            await asyncio.wait_for(asyncio.to_thread(write_started.wait), timeout=1)
            release_write.set()

            with self.assertRaisesRegex(RuntimeError, "background JSONL write failed"):
                await task
            self.assertEqual(runtime.experience_lifecycle_snapshot(), {"activeRunId": None})
            self.assertTrue(observer.outbox.empty())

    async def test_client_cannot_publish_lsl_raw_or_backdate_hub_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            logger = JsonlSessionLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            client = await broker.connect(ClientHello(clientId="external", role=ClientRole.SENSOR))
            await broker.subscribe("external", {Topic.LSL_RAW.value})

            message = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="external",
                topic=Topic.LSL_RAW,
                hubReceivedAt="2000-01-01T00:00:00Z",
                payload={"sensorId": "fake", "runId": "run-1", "samples": []},
            )

            accepted = await runtime.handle_message(message, authenticated_client_id="external")

            self.assertFalse(accepted)
            response = await client.outbox.get()
            self.assertEqual(response.type, MessageType.ERROR)
            self.assertEqual(response.payload["code"], "reserved_topic")
            self.assertFalse(logger.path.exists())

    async def test_background_log_does_not_delay_delivery_between_topics(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            release_write = threading.Event()
            write_started = threading.Event()

            class SlowLogger(JsonlSessionLogger):
                def append(self, message: MessageEnvelope) -> Path:
                    write_started.set()
                    release_write.wait(timeout=1)
                    return super().append(message)

            broker = TopicBroker()
            logger = SlowLogger(
                Path(tmpdir),
                "session-test",
                background_writes=True,
            )
            runtime = HubRuntime(broker=broker, session_logger=logger)
            observer = await broker.connect(
                ClientHello(clientId="dashboard", role=ClientRole.DASHBOARD)
            )
            await broker.subscribe(
                "dashboard",
                {Topic.UNREAL_STATE.value, Topic.SENSOR_STATUS.value},
            )

            try:
                await runtime.handle_message(
                    MessageEnvelope(
                        type=MessageType.PUBLISH,
                        clientId="unreal-test",
                        topic=Topic.UNREAL_STATE,
                        payload={"sequence": 1},
                    )
                )
                await asyncio.wait_for(asyncio.to_thread(write_started.wait), timeout=1)

                started = time.monotonic()
                await runtime.handle_message(
                    MessageEnvelope(
                        type=MessageType.PUBLISH,
                        clientId="sensor-manager",
                        topic=Topic.SENSOR_STATUS,
                        payload={"event": "stale", "sensorId": "sensor-1"},
                    )
                )
                self.assertLess(time.monotonic() - started, 0.1)
                delivered = [
                    await asyncio.wait_for(observer.outbox.get(), timeout=0.2),
                    await asyncio.wait_for(observer.outbox.get(), timeout=0.2),
                ]
                self.assertEqual(
                    [message.topic for message in delivered],
                    [Topic.SENSOR_STATUS.value, Topic.UNREAL_STATE.value],
                )
            finally:
                release_write.set()
                await logger.flush_async()

    async def test_lifecycle_gate_rejects_conflicting_run_before_broadcast(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            logger = JsonlSessionLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            observer = await broker.connect(ClientHello(clientId="dashboard", role=ClientRole.DASHBOARD))
            internal_caller = await broker.connect(
                ClientHello(clientId="dashboard-ui", role=ClientRole.DASHBOARD)
            )
            await broker.subscribe("dashboard", {Topic.EXPERIENCE_LIFECYCLE.value})

            started = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="unreal",
                topic=Topic.EXPERIENCE_LIFECYCLE,
                payload={"event": "started", "runId": "run-authoritative"},
            )
            conflicting = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="dashboard-ui",
                topic=Topic.EXPERIENCE_LIFECYCLE,
                payload={"event": "started", "runId": "run-conflicting"},
            )
            conflicting_end = conflicting.model_copy(
                update={"payload": {"event": "ended", "runId": "run-conflicting"}},
            )
            matching_end = conflicting.model_copy(
                update={"payload": {"event": "ended", "runId": "run-authoritative"}},
            )

            self.assertEqual(await runtime.handle_message(started), ["dashboard"])
            self.assertEqual((await observer.outbox.get()).payload["runId"], "run-authoritative")
            self.assertEqual(
                runtime.experience_lifecycle_snapshot(),
                {"activeRunId": "run-authoritative"},
            )
            self.assertEqual(await runtime.handle_message(conflicting), [])
            self.assertEqual(await runtime.handle_message(conflicting_end), [])
            self.assertTrue(observer.outbox.empty())
            self.assertTrue(internal_caller.outbox.empty())
            self.assertNotIn("run-conflicting", logger.path.read_text(encoding="utf-8"))
            self.assertEqual(await runtime.handle_message(matching_end), ["dashboard"])
            self.assertEqual(
                runtime.experience_lifecycle_snapshot(),
                {"activeRunId": None},
            )

    async def test_authenticated_lifecycle_conflict_returns_correlated_ephemeral_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            logger = JsonlSessionLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            unreal = await broker.connect(ClientHello(clientId="unreal", role=ClientRole.UNREAL))
            dashboard = await broker.connect(
                ClientHello(clientId="dashboard-ui", role=ClientRole.DASHBOARD)
            )
            observer = await broker.connect(
                ClientHello(clientId="observer", role=ClientRole.LOGGER)
            )
            await broker.subscribe("observer", {Topic.EXPERIENCE_LIFECYCLE.value})

            started = MessageEnvelope(
                id="lifecycle-start-authoritative",
                type=MessageType.PUBLISH,
                clientId="unreal",
                topic=Topic.EXPERIENCE_LIFECYCLE,
                payload={"event": "started", "runId": "run-authoritative"},
            )
            conflicting = MessageEnvelope(
                id="lifecycle-start-conflicting",
                type=MessageType.PUBLISH,
                clientId="dashboard-ui",
                topic=Topic.EXPERIENCE_LIFECYCLE,
                payload={"event": "started", "runId": "run-conflicting"},
            )

            self.assertEqual(
                await runtime.handle_message(started, authenticated_client_id="unreal"),
                ["observer"],
            )
            await observer.outbox.get()
            self.assertTrue(unreal.outbox.empty())
            self.assertFalse(
                await runtime.handle_message(
                    conflicting,
                    authenticated_client_id="dashboard-ui",
                )
            )

            error = await dashboard.outbox.get()
            self.assertEqual(error.type, MessageType.ERROR)
            self.assertEqual(error.correlationId, conflicting.id)
            self.assertEqual(error.payload["code"], "lifecycle_conflict")
            self.assertEqual(
                error.payload["detail"],
                {
                    "activeRunId": "run-authoritative",
                    "requestedRunId": "run-conflicting",
                    "requestedEvent": "started",
                },
            )
            self.assertTrue(observer.outbox.empty())
            records = [
                json.loads(line)
                for line in logger.path.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual([record["id"] for record in records], [started.id])

    async def test_authenticated_restart_of_ended_run_returns_correlated_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            logger = JsonlSessionLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            dashboard = await broker.connect(
                ClientHello(clientId="dashboard-ui", role=ClientRole.DASHBOARD)
            )

            def lifecycle(message_id: str, event: str) -> MessageEnvelope:
                return MessageEnvelope(
                    id=message_id,
                    type=MessageType.PUBLISH,
                    clientId="dashboard-ui",
                    topic=Topic.EXPERIENCE_LIFECYCLE,
                    payload={"event": event, "runId": "run-ended"},
                )

            started = lifecycle("lifecycle-start", "started")
            ended = lifecycle("lifecycle-end", "ended")
            restart = lifecycle("lifecycle-restart", "started")
            await runtime.handle_message(started, authenticated_client_id="dashboard-ui")
            await runtime.handle_message(ended, authenticated_client_id="dashboard-ui")

            self.assertFalse(
                await runtime.handle_message(
                    restart,
                    authenticated_client_id="dashboard-ui",
                )
            )
            error = await dashboard.outbox.get()
            self.assertEqual(error.type, MessageType.ERROR)
            self.assertEqual(error.correlationId, restart.id)
            self.assertEqual(error.payload["code"], "lifecycle_already_ended")
            self.assertEqual(
                error.payload["detail"],
                {
                    "activeRunId": None,
                    "requestedRunId": "run-ended",
                    "requestedEvent": "started",
                },
            )
            records = [
                json.loads(line)
                for line in logger.path.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual([record["id"] for record in records], [started.id, ended.id])

    async def test_lifecycle_gate_accepts_idempotent_start_and_end_retries(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            runtime = HubRuntime(
                broker=broker,
                session_logger=JsonlSessionLogger(Path(tmpdir), "session-test"),
            )
            observer = await broker.connect(ClientHello(clientId="dashboard", role=ClientRole.DASHBOARD))
            await broker.subscribe("dashboard", {Topic.EXPERIENCE_LIFECYCLE.value})

            def lifecycle(event: str) -> MessageEnvelope:
                return MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId="dashboard-ui",
                    topic=Topic.EXPERIENCE_LIFECYCLE,
                    payload={"event": event, "runId": "run-stable"},
                )

            self.assertEqual(await runtime.handle_message(lifecycle("started")), ["dashboard"])
            self.assertEqual(await runtime.handle_message(lifecycle("started")), ["dashboard"])
            self.assertEqual(await runtime.handle_message(lifecycle("ended")), ["dashboard"])
            self.assertEqual(await runtime.handle_message(lifecycle("ended")), ["dashboard"])
            self.assertEqual(observer.outbox.qsize(), 4)

    async def test_status_adds_authoritative_lifecycle_and_keeps_sensor_manager(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            app = create_app(
                HubConfig(
                    log_dir=Path(tmpdir),
                    session_id="session-test",
                    cors_origins=[],
                )
            )
            status_route = next(
                route
                for route in app.routes
                if getattr(route, "path", None) == "/status"
            )

            payload = await status_route.endpoint()

            self.assertEqual(
                payload["experienceLifecycle"],
                {"activeRunId": None},
            )
            self.assertIn("sensorManager", payload)
            self.assertIn("activeRunId", payload["sensorManager"])

    async def test_subscribe_then_publish_logs_and_delivers_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            logger = JsonlSessionLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            await broker.connect(ClientHello(clientId="logger", role=ClientRole.LOGGER))

            await runtime.handle_message(
                MessageEnvelope(
                    type=MessageType.SUBSCRIBE,
                    clientId="logger",
                    payload={"topics": ["hrv.raw"]},
                )
            )
            delivered = await runtime.handle_message(
                MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId="hrv-sim",
                    topic=Topic.HRV_RAW,
                    payload={"bpm": 73},
                )
            )

            self.assertEqual(delivered, ["logger"])
            self.assertIn("hrv.raw", logger.path.read_text(encoding="utf-8"))
            self.assertEqual(broker.snapshot()["clients"][0]["messageCount"], 1)

    async def test_custom_device_topic_subscribe_publish_logs_and_delivers_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            logger = JsonlSessionLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            await broker.connect(ClientHello(clientId="dashboard", role=ClientRole.DASHBOARD))

            await runtime.handle_message(
                MessageEnvelope(
                    type=MessageType.SUBSCRIBE,
                    clientId="dashboard",
                    payload={"topics": ["imu.accelerometer.raw"]},
                )
            )
            delivered = await runtime.handle_message(
                MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId="imu-node-1",
                    topic="imu.accelerometer.raw",
                    payload={"x": 0.12, "y": -0.03, "z": 0.98},
                )
            )

            self.assertEqual(delivered, ["dashboard"])
            self.assertIn("imu.accelerometer.raw", logger.path.read_text(encoding="utf-8"))

    async def test_ack_message_clears_pending_command_ack(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            runtime = HubRuntime(
                broker=broker,
                session_logger=JsonlSessionLogger(Path(tmpdir), "session-test"),
            )
            controller = await broker.connect(ClientHello(clientId="controller", role=ClientRole.CONTROLLER))
            await broker.connect(ClientHello(clientId="quest", role=ClientRole.UNREAL))
            await broker.subscribe("quest", {"unreal.commands"})

            command = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="controller",
                topic=Topic.UNREAL_COMMANDS,
                requiresAck=True,
                payload={"action": "pause-session"},
            )
            await runtime.handle_message(command)
            self.assertEqual(broker.pending_ack_count(), 1)

            handled = await runtime.handle_message(
                MessageEnvelope(
                    type=MessageType.ACK,
                    clientId="quest",
                    payload={"messageId": command.id, "status": "rejected", "detail": "busy"},
                )
            )

            self.assertTrue(handled)
            self.assertEqual(broker.pending_ack_count(), 0)
            forwarded = await controller.outbox.get()
            self.assertEqual(forwarded.payload["status"], "rejected")
            self.assertEqual(forwarded.payload["detail"], "busy")


if __name__ == "__main__":
    unittest.main()
