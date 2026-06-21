import unittest
from urllib.error import URLError

from biofeedback_hub.tools import doctor


class DoctorTest(unittest.TestCase):
    def test_build_endpoint_urls_normalizes_ws_and_http(self) -> None:
        urls = doctor.build_endpoint_urls("ws://127.0.0.1:8787/ws")

        self.assertEqual(urls.health_url, "http://127.0.0.1:8787/health")
        self.assertEqual(urls.status_url, "http://127.0.0.1:8787/status")

    def test_format_report_highlights_unreal_command_subscriber(self) -> None:
        report = doctor.format_report(
            health={
                "ok": True,
                "service": "biofeedback-hub",
                "sessionId": "session-test",
            },
            status={
                "clientCount": 1,
                "pendingAckCount": 0,
                "clients": [
                    {
                        "clientId": "unreal-Quest-3",
                        "role": "unreal",
                        "subscriptions": ["unreal.commands"],
                    }
                ],
                "pendingAcks": [],
            },
        )

        self.assertIn("Hub: online", report)
        self.assertIn("Session: session-test", report)
        self.assertIn("Unreal command subscribers: 1", report)
        self.assertIn("unreal-Quest-3", report)
        self.assertIn("Ready for unreal.commands ACK test", report)

    def test_format_report_warns_when_no_unreal_command_subscriber_exists(self) -> None:
        report = doctor.format_report(
            health={
                "ok": True,
                "service": "biofeedback-hub",
                "sessionId": "session-test",
            },
            status={
                "clientCount": 1,
                "pendingAckCount": 0,
                "clients": [
                    {
                        "clientId": "logger",
                        "role": "logger",
                        "subscriptions": ["logger.events"],
                    }
                ],
                "pendingAcks": [],
            },
        )

        self.assertIn("Unreal command subscribers: 0", report)
        self.assertIn("No client is subscribed to unreal.commands", report)

    def test_format_offline_report_suggests_start_command(self) -> None:
        report = doctor.format_offline_report("http://127.0.0.1:8787", URLError("refused"))

        self.assertIn("Hub: offline", report)
        self.assertIn("http://127.0.0.1:8787", report)
        self.assertIn(".\\.venv\\Scripts\\biofeedback-hub", report)


if __name__ == "__main__":
    unittest.main()
