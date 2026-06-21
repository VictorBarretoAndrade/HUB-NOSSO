import unittest

from biofeedback_hub.schemas.capture import (
    CaptureProfile,
    ExportEnvelopeV2,
    RecordingControl,
    SubjectProfile,
)


class CaptureSchemaTest(unittest.TestCase):
    def test_subject_requires_id(self) -> None:
        with self.assertRaises(Exception):
            SubjectProfile()  # type: ignore[call-arg]

    def test_subject_defaults(self) -> None:
        subject = SubjectProfile(subjectId="S-1")
        self.assertEqual(subject.schemaVersion, 2)
        self.assertEqual(subject.confounders.conditions, [])

    def test_capture_profile_round_trip(self) -> None:
        capture = CaptureProfile.model_validate(
            {"mode": "record", "rawEcg": True, "sensors": [{"clientId": "polar-h10", "signals": ["ecg", "rr"]}]}
        )
        self.assertEqual(capture.mode, "record")
        self.assertEqual(capture.sensors[0].signals, ["ecg", "rr"])

    def test_recording_control_parses_start(self) -> None:
        control = RecordingControl.model_validate({"type": "recording", "action": "start", "runId": "run-1"})
        self.assertEqual(control.action, "start")

    def test_export_envelope_carries_context(self) -> None:
        envelope = ExportEnvelopeV2(
            exportedAt="2026-06-21T00:00:00Z",
            subject=SubjectProfile(subjectId="S-1"),
            capture=CaptureProfile(),
        )
        self.assertEqual(envelope.subject.subjectId, "S-1")


if __name__ == "__main__":
    unittest.main()
