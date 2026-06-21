from __future__ import annotations

import asyncio
import math
import time
from collections.abc import AsyncIterator

from biofeedback_hub.adapters.base import SensorSample
from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.topics import Topic


class SimulatedHrvAdapter:
    adapter_id = "hrv-sim"

    def __init__(self, interval_seconds: float = 1.0) -> None:
        self.interval_seconds = interval_seconds
        self._started = time.monotonic()

    async def samples(self) -> AsyncIterator[SensorSample]:
        index = 0
        while True:
            elapsed_ms = int((time.monotonic() - self._started) * 1000)
            bpm = 72 + int(math.sin(index / 5) * 4)
            yield SensorSample(
                topic=Topic.HRV_RAW.value,
                payload={"bpm": bpm, "rrMs": round(60000 / bpm, 2), "source": self.adapter_id},
                collected_at=utc_now_iso(),
                session_time_ms=elapsed_ms,
            )
            index += 1
            await asyncio.sleep(self.interval_seconds)
