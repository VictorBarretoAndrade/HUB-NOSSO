import unittest

from pydantic import ValidationError

from biofeedback_hub.schemas.envelope import ClientHello, ClientRole, MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic


class MessageEnvelopeTest(unittest.TestCase):
    def test_publish_accepts_well_known_topic(self) -> None:
        message = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="hrv-sim",
            topic=Topic.HRV_RAW,
            payload={"bpm": 72},
        )

        self.assertEqual(message.version, 1)
        self.assertEqual(message.topic, Topic.HRV_RAW.value)

    def test_publish_accepts_custom_device_topic(self) -> None:
        message = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="imu-node-1",
            topic="imu.accelerometer.raw",
            payload={"x": 0.12, "y": -0.03, "z": 0.98},
        )

        self.assertEqual(message.topic, "imu.accelerometer.raw")

    def test_hello_accepts_custom_device_role_and_metadata(self) -> None:
        hello = ClientHello(
            clientId="lab-device-1",
            role="wearable",
            capabilities=["heart-rate", "temperature"],
            deviceType="multi-sensor",
            metadata={"firmware": "1.0.0"},
        )

        self.assertEqual(hello.role, "wearable")
        self.assertEqual(hello.deviceType, "multi-sensor")
        self.assertEqual(hello.metadata["firmware"], "1.0.0")

    def test_experience_lifecycle_topic_is_official(self) -> None:
        self.assertEqual(Topic.EXPERIENCE_LIFECYCLE.value, "experience.lifecycle")

    def test_publish_rejects_missing_topic(self) -> None:
        with self.assertRaises(ValidationError):
            MessageEnvelope(type=MessageType.PUBLISH, clientId="hrv-sim", payload={"bpm": 72})

    def test_control_messages_do_not_require_topic(self) -> None:
        hello = MessageEnvelope(
            type=MessageType.HELLO,
            clientId="unreal-quest",
            payload=ClientHello(clientId="unreal-quest", role=ClientRole.UNREAL).model_dump(mode="json"),
        )

        self.assertIsNone(hello.topic)
        self.assertEqual(hello.payload["role"], "unreal")

    def test_session_time_must_not_be_negative(self) -> None:
        with self.assertRaises(ValidationError):
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="unreal-quest",
                topic=Topic.UNREAL_STATE,
                sessionTimeMs=-1,
                payload={"state": "running"},
            )


if __name__ == "__main__":
    unittest.main()
