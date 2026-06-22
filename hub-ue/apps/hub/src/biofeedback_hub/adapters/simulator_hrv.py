from __future__ import annotations

import asyncio
import math
import time
from collections.abc import AsyncIterator

from biofeedback_hub.adapters.base import SensorSample
from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.topics import Topic

# Centros (fração do batimento, 0..1) das ondas do complexo PQRST.
_P_CENTER = 0.05
_Q_CENTER = 0.16
_R_CENTER = 0.18
_S_CENTER = 0.205
_T_CENTER = 0.42
_ECG_SCALE = 1000.0


def ecg_template(frac: float) -> float:
    """Forma de onda PQRST sintética em função da fração do batimento (0..1)."""
    frac = frac % 1.0
    p = 0.10 * math.exp(-((frac - _P_CENTER) ** 2) / (2 * 0.012 ** 2))
    q = -0.15 * math.exp(-((frac - _Q_CENTER) ** 2) / (2 * 0.006 ** 2))
    r = 1.00 * math.exp(-((frac - _R_CENTER) ** 2) / (2 * 0.008 ** 2))
    s = -0.25 * math.exp(-((frac - _S_CENTER) ** 2) / (2 * 0.007 ** 2))
    t = 0.30 * math.exp(-((frac - _T_CENTER) ** 2) / (2 * 0.025 ** 2))
    return p + q + r + s + t


def synthetic_ecg_window(phase: float, n_samples: int, fs: int, bpm: float) -> tuple[list[float], float]:
    """Gera `n_samples` de ECG contínuo a partir de `phase` (em batimentos)."""
    beats_per_sample = (bpm / 60.0) / fs if fs > 0 else 0.0
    samples: list[float] = []
    current = phase
    for _ in range(n_samples):
        samples.append(round(ecg_template(current) * _ECG_SCALE, 2))
        current += beats_per_sample
    return samples, current


class SimulatedHrvAdapter:
    adapter_id = "hrv-sim"

    def __init__(self, interval_seconds: float = 1.0, emit_ecg: bool = False, ecg_fs: int = 130) -> None:
        self.interval_seconds = interval_seconds
        self.emit_ecg = emit_ecg
        self.ecg_fs = ecg_fs
        self._started = time.monotonic()
        self._ecg_phase = 0.0

    async def samples(self) -> AsyncIterator[SensorSample]:
        index = 0
        while True:
            elapsed_ms = int((time.monotonic() - self._started) * 1000)
            bpm = 72 + int(math.sin(index / 5) * 4)
            payload: dict[str, object] = {
                "bpm": bpm,
                "rrMs": round(60000 / bpm, 2),
                "source": self.adapter_id,
            }
            if self.emit_ecg:
                n_samples = max(1, int(self.ecg_fs * self.interval_seconds))
                ecg, self._ecg_phase = synthetic_ecg_window(self._ecg_phase, n_samples, self.ecg_fs, bpm)
                payload["ecg"] = ecg
                payload["ecgSampleRateHz"] = self.ecg_fs
            yield SensorSample(
                topic=Topic.HRV_RAW.value,
                payload=payload,
                collected_at=utc_now_iso(),
                session_time_ms=elapsed_ms,
            )
            index += 1
            await asyncio.sleep(self.interval_seconds)
