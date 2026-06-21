from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncIterator, Protocol


@dataclass(frozen=True)
class SensorSample:
    topic: str
    payload: dict[str, Any]
    collected_at: str | None = None
    session_time_ms: int | None = None


class SensorAdapter(Protocol):
    adapter_id: str

    def samples(self) -> AsyncIterator[SensorSample]:
        ...
