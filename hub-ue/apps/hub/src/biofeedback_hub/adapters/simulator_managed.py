from __future__ import annotations

import asyncio
import math
import time
from collections.abc import AsyncIterator

from biofeedback_hub.adapters.base import SensorSample
from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.topics import Topic


class SimulatedManagedHrvAdapter:
    sensor_id = "sim-hrv-1"
    adapter_id = "simulator"
    source = "simulator"
    display_name = "Simulated HRV Sensor"
    device_type = "hrv"
    topics = [Topic.HRV_RAW.value]

    def __init__(self, interval_seconds: float = 1.0) -> None:
        self.interval_seconds = interval_seconds
        self._started = time.monotonic()
        self._sequence = 0
        self._connected = False
        self._recording_run_id: str | None = None

    async def scan(self) -> bool:
        await asyncio.sleep(0)
        return True

    async def connect(self) -> None:
        await asyncio.sleep(0)
        self._connected = True

    async def disconnect(self) -> None:
        await asyncio.sleep(0)
        self._connected = False
        self._recording_run_id = None

    async def samples(self) -> AsyncIterator[SensorSample]:
        while self._connected:
            await asyncio.sleep(self.interval_seconds)
            if not self._connected:
                break
            yield self._next_sample()

    def _next_sample(self) -> SensorSample:
        self._sequence += 1
        elapsed_ms = int((time.monotonic() - self._started) * 1000)
        bpm = 72 + int(math.sin(self._sequence / 5) * 4)
        return SensorSample(
            topic=Topic.HRV_RAW.value,
            payload={
                "bpm": bpm,
                "rrMs": round(60000 / bpm, 2),
                "quality": "good",
                "sequence": self._sequence,
                "source": self.source,
            },
            collected_at=utc_now_iso(),
            session_time_ms=elapsed_ms,
        )

    async def start_recording(self, run_id: str) -> None:
        await asyncio.sleep(0)
        self._recording_run_id = run_id

    async def stop_recording(self, run_id: str) -> None:
        await asyncio.sleep(0)
        if self._recording_run_id == run_id:
            self._recording_run_id = None

    def status(self) -> dict[str, object]:
        return {
            "sensorId": self.sensor_id,
            "adapterId": self.adapter_id,
            "source": self.source,
            "displayName": self.display_name,
            "deviceType": self.device_type,
            "topics": self.topics,
            "connected": self._connected,
            "recordingRunId": self._recording_run_id,
        }
