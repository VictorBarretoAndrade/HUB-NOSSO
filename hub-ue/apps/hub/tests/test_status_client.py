import unittest

from biofeedback_hub.tools.status_client import build_status_url, format_status


class StatusClientTest(unittest.TestCase):
    def test_build_status_url_from_ws_or_http_url(self) -> None:
        self.assertEqual(build_status_url("ws://127.0.0.1:8787/ws"), "http://127.0.0.1:8787/status")
        self.assertEqual(build_status_url("http://127.0.0.1:8787"), "http://127.0.0.1:8787/status")

    def test_format_status_lists_clients_and_pending_acks(self) -> None:
        output = format_status(
            {
                "sessionId": "session-test",
                "clientCount": 1,
                "pendingAckCount": 1,
                "clients": [
                    {
                        "clientId": "quest",
                        "role": "unreal",
                        "capabilities": ["commands"],
                        "subscriptions": ["unreal.commands"],
                        "outboxSize": 0,
                    }
                ],
                "pendingAcks": [
                    {
                        "messageId": "cmd-1",
                        "recipientClientId": "quest",
                        "publisherClientId": "controller",
                    }
                ],
            }
        )

        self.assertIn("session-test", output)
        self.assertIn("quest", output)
        self.assertIn("unreal.commands", output)
        self.assertIn("cmd-1", output)


if __name__ == "__main__":
    unittest.main()
