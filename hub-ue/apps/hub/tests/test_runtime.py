import tempfile
import unittest
from pathlib import Path

from biofeedback_hub.core.broker import TopicBroker
from biofeedback_hub.core.runtime import HubRuntime
from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.schemas.envelope import ClientHello, ClientRole, MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic


class HubRuntimeTest(unittest.IsolatedAsyncioTestCase):
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
                    payload={"messageId": command.id, "status": "accepted"},
                )
            )

            self.assertTrue(handled)
            self.assertEqual(broker.pending_ack_count(), 0)


if __name__ == "__main__":
    unittest.main()
