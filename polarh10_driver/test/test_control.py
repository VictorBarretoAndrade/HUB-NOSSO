import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.control import handle_control_command


class FakeRecorder:
    def __init__(self) -> None:
        self.started = None
        self.stopped = False

    def start(self, run_id, capture=None):
        self.started = run_id
        return Path("data/recordings/x.csv")

    def stop(self):
        self.stopped = True
        return Path("data/recordings/x.csv")


class ControlTest(unittest.TestCase):
    def test_start_routes_to_recorder(self) -> None:
        rec = FakeRecorder()
        result = asyncio.run(handle_control_command({"action": "start", "runId": "run-1"}, rec))
        self.assertTrue(result["ok"])
        self.assertEqual(rec.started, "run-1")

    def test_stop_routes_to_recorder(self) -> None:
        rec = FakeRecorder()
        result = asyncio.run(handle_control_command({"action": "stop", "runId": "run-1"}, rec))
        self.assertTrue(result["ok"])
        self.assertTrue(rec.stopped)

    def test_unknown_action(self) -> None:
        result = asyncio.run(handle_control_command({"action": "frobnicate"}, FakeRecorder()))
        self.assertFalse(result["ok"])

    def test_no_recorder(self) -> None:
        result = asyncio.run(handle_control_command({"action": "start"}, None))
        self.assertFalse(result["ok"])


if __name__ == "__main__":
    unittest.main()
