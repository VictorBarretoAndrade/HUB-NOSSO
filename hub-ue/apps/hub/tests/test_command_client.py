import unittest

from biofeedback_hub.schemas.envelope import MessageType
from biofeedback_hub.schemas.topics import Topic
from biofeedback_hub.tools.command_client import build_command_message, build_connect_url


class CommandClientTest(unittest.TestCase):
    def test_builds_unreal_command_requiring_ack(self) -> None:
        message = build_command_message(
            client_id="controller",
            action="pause-session",
            arguments={"reason": "operator"},
        )

        self.assertEqual(message.type, MessageType.PUBLISH)
        self.assertEqual(message.topic, Topic.UNREAL_COMMANDS)
        self.assertTrue(message.requiresAck)
        self.assertEqual(message.payload["action"], "pause-session")
        self.assertEqual(message.payload["arguments"], {"reason": "operator"})

    def test_connect_url_appends_token_query(self) -> None:
        self.assertEqual(
            build_connect_url("ws://127.0.0.1:8787/ws", "local-secret"),
            "ws://127.0.0.1:8787/ws?token=local-secret",
        )
        self.assertEqual(
            build_connect_url("ws://127.0.0.1:8787/ws?foo=bar", "local-secret"),
            "ws://127.0.0.1:8787/ws?foo=bar&token=local-secret",
        )


if __name__ == "__main__":
    unittest.main()
