import asyncio
import unittest

from biofeedback_hub.core.broker import TopicBroker
from biofeedback_hub.schemas.envelope import ClientHello, ClientRole, MessageEnvelope, MessageType


class TopicBrokerTest(unittest.IsolatedAsyncioTestCase):
    async def test_publish_reaches_subscribed_clients_only(self) -> None:
        broker = TopicBroker()
        subscriber = await broker.connect(ClientHello(clientId="logger", role=ClientRole.LOGGER))
        unrelated = await broker.connect(ClientHello(clientId="eeg", role=ClientRole.SENSOR))

        await broker.subscribe("logger", {"hrv.raw"})
        await broker.subscribe("eeg", {"eeg.raw"})

        message = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="hrv-sim",
            topic="hrv.raw",
            payload={"bpm": 72},
        )
        delivered = await broker.publish(message)

        self.assertEqual(delivered, ["logger"])
        self.assertEqual(subscriber.outbox.qsize(), 1)
        self.assertEqual(unrelated.outbox.qsize(), 0)

    async def test_custom_device_topics_are_routed_like_first_class_topics(self) -> None:
        broker = TopicBroker()
        subscriber = await broker.connect(ClientHello(clientId="analytics", role="dashboard"))
        await broker.connect(
            ClientHello(
                clientId="imu-node-1",
                role="sensor",
                capabilities=["accelerometer", "gyroscope"],
                deviceType="imu",
            )
        )
        await broker.subscribe("analytics", {"imu.accelerometer.raw"})

        message = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="imu-node-1",
            topic="imu.accelerometer.raw",
            payload={"x": 0.12, "y": -0.03, "z": 0.98},
        )
        delivered = await broker.publish(message)

        self.assertEqual(delivered, ["analytics"])
        self.assertEqual((await subscriber.outbox.get()).topic, "imu.accelerometer.raw")

    async def test_unsubscribe_removes_client_from_topic_index(self) -> None:
        broker = TopicBroker()
        subscriber = await broker.connect(ClientHello(clientId="analytics", role="dashboard"))
        await broker.subscribe("analytics", {"imu.accelerometer.raw"})
        await broker.unsubscribe("analytics", {"imu.accelerometer.raw"})

        delivered = await broker.publish(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="imu-node-1",
                topic="imu.accelerometer.raw",
                payload={"x": 0.12},
            )
        )

        self.assertEqual(delivered, [])
        self.assertEqual(subscriber.outbox.qsize(), 0)

    async def test_disconnect_removes_client_from_topic_index(self) -> None:
        broker = TopicBroker()
        subscriber = await broker.connect(ClientHello(clientId="analytics", role="dashboard"))
        await broker.subscribe("analytics", {"imu.accelerometer.raw"})
        await broker.disconnect("analytics")

        delivered = await broker.publish(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="imu-node-1",
                topic="imu.accelerometer.raw",
                payload={"x": 0.12},
            )
        )

        self.assertEqual(delivered, [])

    async def test_requires_ack_tracks_pending_ack_for_each_recipient(self) -> None:
        broker = TopicBroker()
        await broker.connect(ClientHello(clientId="quest", role=ClientRole.UNREAL))
        await broker.subscribe("quest", {"unreal.commands"})

        command = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="controller",
            topic="unreal.commands",
            requiresAck=True,
            payload={"action": "pause-session"},
        )
        await broker.publish(command)

        self.assertEqual(broker.pending_ack_count(), 1)
        self.assertTrue(await broker.acknowledge(command.id, "quest", status="accepted"))
        self.assertEqual(broker.pending_ack_count(), 0)

    async def test_ack_is_forwarded_to_original_command_publisher(self) -> None:
        broker = TopicBroker()
        controller = await broker.connect(ClientHello(clientId="controller", role=ClientRole.CONTROLLER))
        await broker.connect(ClientHello(clientId="quest", role=ClientRole.UNREAL))
        await broker.subscribe("quest", {"unreal.commands"})

        command = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="controller",
            topic="unreal.commands",
            requiresAck=True,
            payload={"action": "pause-session"},
        )
        await broker.publish(command)

        self.assertTrue(await broker.acknowledge(command.id, "quest", status="accepted", detail="ok"))
        ack = await asyncio.wait_for(controller.outbox.get(), timeout=1)
        self.assertEqual(ack.type, MessageType.ACK)
        self.assertEqual(ack.correlationId, command.id)
        self.assertEqual(ack.payload["messageId"], command.id)
        self.assertEqual(ack.payload["clientId"], "quest")
        self.assertEqual(ack.payload["detail"], "ok")

    async def test_snapshot_lists_clients_subscriptions_and_pending_acks(self) -> None:
        broker = TopicBroker()
        await broker.connect(
            ClientHello(clientId="quest", role=ClientRole.UNREAL, capabilities=["commands"])
        )
        await broker.connect(ClientHello(clientId="controller", role=ClientRole.CONTROLLER))
        await broker.subscribe("quest", {"unreal.commands", "logger.events"})

        command = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="controller",
            topic="unreal.commands",
            requiresAck=True,
            payload={"action": "pause-session"},
        )
        await broker.publish(command)

        snapshot = broker.snapshot()

        self.assertEqual(snapshot["clientCount"], 2)
        self.assertEqual(snapshot["pendingAckCount"], 1)
        self.assertEqual(snapshot["clients"][0]["clientId"], "controller")
        self.assertEqual(snapshot["clients"][1]["clientId"], "quest")
        self.assertEqual(snapshot["clients"][1]["subscriptions"], ["logger.events", "unreal.commands"])
        self.assertEqual(snapshot["clients"][1]["role"], "unreal")
        self.assertIn("connectedAt", snapshot["clients"][1])
        self.assertIn("lastSeenAt", snapshot["clients"][1])
        self.assertEqual(snapshot["clients"][1]["messageCount"], 0)
        self.assertEqual(
            snapshot["pendingAcks"],
            [
                {
                    "messageId": command.id,
                    "recipientClientId": "quest",
                    "publisherClientId": "controller",
                }
            ],
        )

    async def test_dashboard_outbox_coalesces_visual_topics_but_keeps_reliable_fifo(self) -> None:
        broker = TopicBroker()
        dashboard = await broker.connect(ClientHello(clientId="dashboard", role=ClientRole.DASHBOARD))
        await broker.subscribe("dashboard", {"hrv.raw", "sensor.status"})

        await broker.publish(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="sensor-manager",
                topic="hrv.raw",
                payload={"sensorId": "polar", "sequence": 1},
            )
        )
        await broker.publish(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="sensor-manager",
                topic="hrv.raw",
                payload={"sensorId": "polar", "sequence": 2},
            )
        )
        await broker.publish(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="sensor-manager",
                topic="sensor.status",
                payload={"event": "connected"},
            )
        )

        self.assertEqual((await dashboard.outbox.get()).topic, "sensor.status")
        latest = await dashboard.outbox.get()
        self.assertEqual(latest.payload["sequence"], 2)
        self.assertEqual(dashboard.outbox.snapshot()["coalescedCount"], 1)

    async def test_reliable_outbox_overflow_closes_slow_consumer(self) -> None:
        broker = TopicBroker()
        dashboard = await broker.connect(ClientHello(clientId="dashboard", role=ClientRole.DASHBOARD))
        dashboard.outbox.max_reliable = 1
        dashboard.outbox._reliable = asyncio.Queue(maxsize=1)
        await broker.subscribe("dashboard", {"sensor.status"})

        message = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="sensor-manager",
            topic="sensor.status",
            payload={"event": "connected"},
        )
        await broker.publish(message)
        delivered = await broker.publish(message.model_copy(update={"id": "second"}))

        self.assertEqual(delivered, [])
        self.assertIsNone(broker.get_client("dashboard"))
        self.assertEqual(dashboard.outbox.snapshot()["closeReason"], "slow_consumer")


if __name__ == "__main__":
    unittest.main()
