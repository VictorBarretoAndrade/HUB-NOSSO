import json
import tempfile
import unittest
from pathlib import Path

from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.schemas.envelope import MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic


class JsonlSessionLoggerTest(unittest.TestCase):
    def test_appends_message_with_hub_received_timestamp(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = JsonlSessionLogger(Path(tmpdir), session_id="session-test")
            message = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="hrv-sim",
                topic=Topic.HRV_RAW,
                payload={"bpm": 72},
            )

            path = logger.append(message)

            lines = path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            record = json.loads(lines[0])
            self.assertEqual(record["topic"], "hrv.raw")
            self.assertEqual(record["payload"], {"bpm": 72})
            self.assertIsNotNone(record["hubReceivedAt"])


if __name__ == "__main__":
    unittest.main()
