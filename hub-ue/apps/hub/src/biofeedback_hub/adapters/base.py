from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Protocol


@dataclass(frozen=True)
class SensorSample:
    topic: str
    payload: dict[str, Any]
    preview_payload: dict[str, Any] | None = None
    collected_at: str | None = None
    session_time_ms: int | None = None


@dataclass(frozen=True)
class SensorDiscoveryResult:
    adapters: list[ManagedSensorAdapter] = field(default_factory=list)
    discovered_count: int = 0
    supported_count: int = 0
    unsupported_count: int = 0
    scan_succeeded: bool = True


class SensorAdapter(Protocol):
    adapter_id: str

    def samples(self) -> AsyncIterator[SensorSample]:
        ...


class ManagedSensorAdapter(Protocol):
    sensor_id: str
    adapter_id: str
    source: str
    display_name: str
    device_type: str
    topics: list[str]

    async def scan(self) -> bool:
        ...

    async def connect(self) -> None:
        ...

    async def disconnect(self) -> None:
        ...

    def samples(self) -> AsyncIterator[SensorSample]:
        ...

    async def start_recording(self, run_id: str) -> None:
        ...

    async def stop_recording(self, run_id: str) -> None:
        ...

    def status(self) -> dict[str, Any]:
        ...


class SensorDiscoveryProvider(Protocol):
    provider_id: str

    async def prepare(self) -> None:
        ...

    async def discover(self) -> SensorDiscoveryResult:
        ...

    def snapshot(self) -> dict[str, Any]:
        ...
