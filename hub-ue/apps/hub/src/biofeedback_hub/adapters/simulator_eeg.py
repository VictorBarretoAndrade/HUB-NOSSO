from __future__ import annotations

import asyncio
import math
import time
from collections.abc import AsyncIterator

from biofeedback_hub.adapters.base import SensorSample
from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.topics import Topic


class SimulatedEegAdapter:
    adapter_id = "eeg-sim"

    def __init__(self, interval_seconds: float = 0.5) -> None:
        self.interval_seconds = interval_seconds
        self._started = time.monotonic()

    async def samples(self) -> AsyncIterator[SensorSample]:
        index = 0
        while True:
            elapsed_ms = int((time.monotonic() - self._started) * 1000)
            yield SensorSample(
                topic=Topic.EEG_RAW.value,
                payload={
                    "alpha": round(0.5 + math.sin(index / 7) * 0.1, 4),
                    "beta": round(0.4 + math.cos(index / 9) * 0.08, 4),
                    "source": self.adapter_id,
                },
                collected_at=utc_now_iso(),
                session_time_ms=elapsed_ms,
            )
            index += 1
            await asyncio.sleep(self.interval_seconds)
