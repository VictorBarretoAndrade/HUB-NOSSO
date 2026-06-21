import json
import sys
import tempfile
import unittest
from pathlib import Path

# Garante a raiz do driver no sys.path (tools/) independente de como o teste é descoberto.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.export_cli import build_parser, load_jsonl


class ExportCliTest(unittest.TestCase):
    def test_parser_defaults(self) -> None:
        args = build_parser().parse_args(["--session", "s1", "--out", "out.npy"])
        self.assertEqual(args.signal, "ecg")
        self.assertEqual(args.format, "npy")

    def test_load_jsonl_reads_envelopes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "session.jsonl"
            path.write_text(
                json.dumps({"topic": "hrv.raw", "payload": {"bpm": 72}}) + "\n",
                encoding="utf-8",
            )
            records = load_jsonl(path)
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["topic"], "hrv.raw")

    # TODO(④): testar extract_series para ecg/rr/hr quando implementado.
    @unittest.skip("extract_series ainda não implementado (exigência ④)")
    def test_extract_series(self) -> None:  # pragma: no cover
        ...


if __name__ == "__main__":
    unittest.main()
