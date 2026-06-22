import json
import sys
import tempfile
import unittest
from pathlib import Path

# Garante a raiz do driver no sys.path (tools/) independente de como o teste é descoberto.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.export_cli import (
    build_export_meta,
    build_parser,
    extract_series,
    latest_lifecycle_started,
    load_jsonl,
    main,
)


def _write_session(path: Path) -> None:
    records = [
        {
            "topic": "experience.lifecycle",
            "hubReceivedAt": "2026-06-21T00:00:00Z",
            "payload": {
                "event": "started",
                "runId": "run-1",
                "subject": {"schemaVersion": 2, "subjectId": "S-1"},
                "capture": {"schemaVersion": 2, "mode": "record", "rawEcg": True, "sensors": []},
            },
        },
        {"topic": "hrv.raw", "payload": {"ecg": [1, 2, 3], "rrMs": 800, "bpm": 75}},
        {"topic": "hrv.raw", "payload": {"ecg": [4, 5], "rrMs": 810, "bpm": 74}},
        {"topic": "unreal.state", "payload": {"state": "running"}},
    ]
    path.write_text("\n".join(json.dumps(r) for r in records) + "\n", encoding="utf-8")


class ExportCliTest(unittest.TestCase):
    def test_parser_defaults(self) -> None:
        args = build_parser().parse_args(["--session", "s1", "--out", "out.npy"])
        self.assertEqual(args.signal, "ecg")
        self.assertEqual(args.format, "npy")

    def test_load_jsonl_reads_envelopes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "session.jsonl"
            _write_session(path)
            self.assertEqual(len(load_jsonl(path)), 4)

    def test_extract_series_per_signal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "session.jsonl"
            _write_session(path)
            records = load_jsonl(path)
            self.assertEqual(extract_series(records, "ecg"), [1.0, 2.0, 3.0, 4.0, 5.0])
            self.assertEqual(extract_series(records, "rr"), [800.0, 810.0])
            self.assertEqual(extract_series(records, "hr"), [75.0, 74.0])

    def test_metadata_from_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "session.jsonl"
            _write_session(path)
            records = load_jsonl(path)
            self.assertIsNotNone(latest_lifecycle_started(records))
            meta = build_export_meta(records, "ecg", 5, "2026-06-21T00:00:01Z")
            self.assertEqual(meta["schemaVersion"], 2)
            self.assertEqual(meta["subject"]["subjectId"], "S-1")
            self.assertEqual(meta["capture"]["mode"], "record")
            self.assertEqual(meta["run"]["runId"], "run-1")

    def test_main_writes_npy_and_meta(self) -> None:
        try:
            import numpy as np
        except Exception:
            self.skipTest("numpy não instalado")
        with tempfile.TemporaryDirectory() as tmp:
            session = Path(tmp) / "session.jsonl"
            _write_session(session)
            out = Path(tmp) / "ecg.npy"
            main(["--session", str(session), "--signal", "ecg", "--format", "npy", "--out", str(out)])
            self.assertTrue(out.exists())
            self.assertEqual(len(np.load(out)), 5)
            meta = json.loads((Path(tmp) / "ecg.meta.json").read_text(encoding="utf-8"))
            self.assertEqual(meta["subject"]["subjectId"], "S-1")

    def test_main_writes_mat(self) -> None:
        try:
            import scipy.io  # noqa: F401
        except Exception:
            self.skipTest("scipy não instalado")
        with tempfile.TemporaryDirectory() as tmp:
            session = Path(tmp) / "session.jsonl"
            _write_session(session)
            out = Path(tmp) / "rr.mat"
            main(["--session", str(session), "--signal", "rr", "--format", "mat", "--out", str(out)])
            self.assertTrue(out.exists())


if __name__ == "__main__":
    unittest.main()
