import sys
import tempfile
import unittest
from pathlib import Path

# Garante a raiz do driver no sys.path (core/) independente de como o teste é descoberto.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.recorder import Recorder


class RecorderTest(unittest.TestCase):
    def test_records_csv_and_returns_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            rec = Recorder(output_dir=tmp)
            self.assertFalse(rec.active)

            csv_path = rec.start("run-1", {"sensors": [{"clientId": "polar-h10", "signals": ["ecg"]}]})
            self.assertTrue(rec.active)

            rec.write({"seq": 1, "timestamp": 1.0, "samples": [10, 11, 12], "metrics": {"hr": 70, "rr": 0.85}})
            rec.write({"seq": 2, "timestamp": 2.0, "samples": [13, 14]})

            returned = rec.stop()
            self.assertFalse(rec.active)
            self.assertEqual(returned, csv_path)
            self.assertTrue(csv_path.exists())

            lines = csv_path.read_text(encoding="utf-8").strip().splitlines()
            self.assertTrue(lines[0].startswith("timestamp,seq,sampleIndex,ecg"))
            self.assertEqual(len(lines), 6)  # cabeçalho + 5 amostras

    def test_npy_written_when_numpy_available(self) -> None:
        try:
            import numpy  # noqa: F401
        except Exception:
            self.skipTest("numpy não instalado")

        with tempfile.TemporaryDirectory() as tmp:
            rec = Recorder(output_dir=tmp)
            rec.start("run-x")
            rec.write({"seq": 1, "samples": [1.0, 2.0, 3.0]})
            rec.stop()
            self.assertTrue((Path(tmp) / "run-x_polar-h10_ecg.npy").exists())

    def test_write_ignored_when_inactive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            rec = Recorder(output_dir=tmp)
            rec.write({"seq": 1, "samples": [1]})  # no-op
            self.assertIsNone(rec.stop())


if __name__ == "__main__":
    unittest.main()
