from __future__ import annotations

import asyncio
import unittest

from biofeedback_hub.adapters.simulator_hrv import (
    SimulatedHrvAdapter,
    ecg_template,
    synthetic_ecg_window,
)


async def _first_sample(adapter: SimulatedHrvAdapter):
    async for sample in adapter.samples():
        return sample
    raise AssertionError("adapter produced no samples")


class SimulatorHrvTest(unittest.TestCase):
    def test_synthetic_window_length_and_phase_advance(self) -> None:
        samples, phase = synthetic_ecg_window(0.0, 130, 130, 75)
        self.assertEqual(len(samples), 130)
        self.assertGreater(phase, 0.0)

    def test_r_peak_dominates_baseline(self) -> None:
        self.assertGreater(ecg_template(0.18), ecg_template(0.7))

    def test_adapter_emits_ecg_when_enabled(self) -> None:
        sample = asyncio.run(_first_sample(SimulatedHrvAdapter(emit_ecg=True)))
        self.assertIn("ecg", sample.payload)
        self.assertGreater(len(sample.payload["ecg"]), 0)
        self.assertEqual(sample.payload["ecgSampleRateHz"], 130)
        self.assertIn("bpm", sample.payload)

    def test_adapter_default_has_no_ecg(self) -> None:
        sample = asyncio.run(_first_sample(SimulatedHrvAdapter()))
        self.assertNotIn("ecg", sample.payload)


if __name__ == "__main__":
    unittest.main()
