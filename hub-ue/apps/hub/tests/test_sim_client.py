from __future__ import annotations

import unittest

from biofeedback_hub.tools.sim_client import (
    MULTI_SENSOR_TOPICS,
    build_experience_lifecycle_payload,
    build_unreal_command_ack_payload,
    build_unreal_state_payload,
    logger_subscription_topics,
    multi_sensor_profiles,
    next_experience_marker_payload_for_command,
    next_unreal_state_payload_for_command,
)


class SimClientTest(unittest.TestCase):
    def test_logger_does_not_subscribe_to_ack_required_command_topic(self) -> None:
        topics = logger_subscription_topics()

        self.assertIn("unreal.state", topics)
        self.assertIn("experience.lifecycle", topics)
        self.assertIn("logger.events", topics)
        self.assertIn("ecg.raw", topics)
        self.assertIn("imu.accelerometer.raw", topics)
        self.assertIn("temperature.raw", topics)
        self.assertIn("air.quality.raw", topics)
        self.assertNotIn("unreal.commands", topics)

    def test_multi_sensor_profiles_cover_demo_topics(self) -> None:
        profiles = multi_sensor_profiles()

        self.assertEqual([profile.topic for profile in profiles], MULTI_SENSOR_TOPICS)
        self.assertEqual(len({profile.client_id for profile in profiles}), len(profiles))
        self.assertIn("air.quality.raw", [profile.topic for profile in profiles])

    def test_multi_sensor_payload_factories_include_sequence_and_source(self) -> None:
        for profile in multi_sensor_profiles():
            payload = profile.payload_factory(3, 1.5)

            self.assertEqual(payload["sequence"], 3)
            self.assertEqual(payload["source"], "multi-sensor-demo")

    def test_experience_lifecycle_payload_has_run_id_and_source(self) -> None:
        payload = build_experience_lifecycle_payload("started", run_id="run-1", label="block A")

        self.assertEqual(payload["event"], "started")
        self.assertEqual(payload["runId"], "run-1")
        self.assertEqual(payload["label"], "block A")
        self.assertEqual(payload["source"], "xr")

    def test_unreal_state_payload_starts_running(self) -> None:
        payload = build_unreal_state_payload("running")

        self.assertEqual(payload["state"], "running")
        self.assertEqual(payload["status"], "online")
        self.assertEqual(payload["fps"], 72)

    def test_pause_session_command_moves_unreal_state_to_paused(self) -> None:
        payload = next_unreal_state_payload_for_command(
            {
                "id": "cmd-1",
                "payload": {
                    "action": "pause-session",
                    "arguments": {"reason": "dashboard"},
                },
            }
        )

        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload["state"], "paused")
        self.assertEqual(payload["status"], "idle")
        self.assertEqual(payload["fps"], 0)
        self.assertEqual(payload["lastCommandId"], "cmd-1")
        self.assertEqual(payload["reason"], "dashboard")

    def test_resume_session_command_moves_unreal_state_to_running(self) -> None:
        payload = next_unreal_state_payload_for_command(
            {
                "id": "cmd-2",
                "payload": {
                    "action": "resume-session",
                    "arguments": {"reason": "dashboard"},
                },
            }
        )

        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload["state"], "running")
        self.assertEqual(payload["status"], "online")
        self.assertEqual(payload["fps"], 72)
        self.assertEqual(payload["lastCommandId"], "cmd-2")
        self.assertEqual(payload["reason"], "dashboard")

    def test_unsupported_unreal_command_is_rejected_without_state_change(self) -> None:
        message = {"id": "cmd-3", "payload": {"action": "calibrate"}}

        ack = build_unreal_command_ack_payload(message)

        self.assertEqual(ack["messageId"], "cmd-3")
        self.assertEqual(ack["status"], "rejected")
        self.assertIn("Unsupported command action", ack["detail"])
        self.assertIsNone(next_unreal_state_payload_for_command(message))

    def test_add_marker_command_is_accepted_with_label(self) -> None:
        message = {
            "id": "cmd-marker",
            "payload": {
                "action": "add-marker",
                "arguments": {
                    "reason": "dashboard",
                    "markerId": "marker-1",
                    "label": "stimulus-start",
                    "note": "first block",
                },
            },
        }

        ack = build_unreal_command_ack_payload(message)
        marker = next_experience_marker_payload_for_command(message)

        self.assertEqual(ack["messageId"], "cmd-marker")
        self.assertEqual(ack["status"], "accepted")
        self.assertIsNotNone(marker)
        assert marker is not None
        self.assertEqual(marker["markerId"], "marker-1")
        self.assertEqual(marker["commandId"], "cmd-marker")
        self.assertEqual(marker["label"], "stimulus-start")
        self.assertEqual(marker["note"], "first block")
        self.assertEqual(marker["source"], "dashboard")
        self.assertEqual(marker["reason"], "dashboard")
        self.assertIsNone(next_unreal_state_payload_for_command(message))

    def test_add_marker_command_without_label_is_rejected(self) -> None:
        message = {
            "id": "cmd-marker",
            "payload": {
                "action": "add-marker",
                "arguments": {
                    "reason": "dashboard",
                    "markerId": "marker-1",
                    "label": "  ",
                },
            },
        }

        ack = build_unreal_command_ack_payload(message)

        self.assertEqual(ack["messageId"], "cmd-marker")
        self.assertEqual(ack["status"], "rejected")
        self.assertIn("Marker label is required", ack["detail"])
        self.assertIsNone(next_experience_marker_payload_for_command(message))


if __name__ == "__main__":
    unittest.main()
