from __future__ import annotations

import asyncio
import hashlib
import importlib
import math
import time
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from biofeedback_hub.adapters.base import SensorDiscoveryResult, SensorSample
from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.topics import Topic


LSL_RAW_TOPIC = Topic.LSL_RAW.value
NUMERIC_CHANNEL_FORMATS = {
    "float32",
    "double64",
    "int8",
    "int16",
    "int32",
    "int64",
}
UNSUPPORTED_STREAM_TYPES = {"marker", "markers"}


async def _await_task_completion(task: asyncio.Task[Any]) -> Any:
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            continue
    return task.result()


class LslUnavailableError(RuntimeError):
    pass


class LslBackend(Protocol):
    def resolve_streams(self, wait_time: float) -> list[Any]:
        ...

    def channel_format_name(self, info: Any) -> str:
        ...

    def create_inlet(self, info: Any) -> Any:
        ...

    def open_stream(self, inlet: Any, timeout: float) -> None:
        ...

    def full_info(self, inlet: Any, timeout: float) -> Any:
        ...

    def close_stream(self, inlet: Any) -> None:
        ...

    def pull_chunk(self, inlet: Any, timeout: float, max_samples: int) -> tuple[list[Any], list[float]]:
        ...

    def flush_samples(self, inlet: Any) -> int:
        ...

    def time_correction(self, inlet: Any, timeout: float) -> float:
        ...

    def local_clock(self) -> float:
        ...


class PylslBackend:
    def __init__(self, pylsl_module: Any) -> None:
        self._pylsl = pylsl_module

    @classmethod
    def load(cls) -> PylslBackend:
        try:
            module = importlib.import_module("pylsl")
        except ModuleNotFoundError as exc:
            if exc.name == "pylsl":
                raise LslUnavailableError(
                    "pylsl is not installed; install biofeedback-hub[lsl] to enable LSL"
                ) from exc
            raise
        return cls(module)

    def resolve_streams(self, wait_time: float) -> list[Any]:
        return list(self._pylsl.resolve_streams(wait_time=wait_time))

    def channel_format_name(self, info: Any) -> str:
        value = info.channel_format()
        for name in (*sorted(NUMERIC_CHANNEL_FORMATS), "string", "undefined"):
            constant = getattr(self._pylsl, f"cf_{name}", object())
            if value == constant:
                return name
        return str(value).strip().lower()

    def create_inlet(self, info: Any) -> Any:
        return self._pylsl.StreamInlet(info, max_buflen=60, recover=True)

    def open_stream(self, inlet: Any, timeout: float) -> None:
        inlet.open_stream(timeout=timeout)

    def full_info(self, inlet: Any, timeout: float) -> Any:
        return inlet.info(timeout=timeout)

    def close_stream(self, inlet: Any) -> None:
        inlet.close_stream()

    def pull_chunk(self, inlet: Any, timeout: float, max_samples: int) -> tuple[list[Any], list[float]]:
        samples, timestamps = inlet.pull_chunk(timeout=timeout, max_samples=max_samples)
        return list(samples), list(timestamps)

    def flush_samples(self, inlet: Any) -> int:
        return int(inlet.flush())

    def time_correction(self, inlet: Any, timeout: float) -> float:
        return float(inlet.time_correction(timeout=timeout))

    def local_clock(self) -> float:
        return float(self._pylsl.local_clock())


class LslDiscoveryProvider:
    provider_id = "lsl"

    def __init__(
        self,
        *,
        enabled: bool = True,
        discovery_timeout_seconds: float = 1.0,
        pull_timeout_seconds: float = 0.1,
        time_correction_timeout_seconds: float = 2.0,
        max_chunk_samples: int = 256,
        backend_factory: Callable[[], LslBackend] | None = None,
    ) -> None:
        self.enabled = enabled
        self.discovery_timeout_seconds = discovery_timeout_seconds
        self.pull_timeout_seconds = pull_timeout_seconds
        self.time_correction_timeout_seconds = time_correction_timeout_seconds
        self.max_chunk_samples = max_chunk_samples
        self._backend_factory = backend_factory or PylslBackend.load
        self._backend: LslBackend | None = None
        self._state = "disabled" if not enabled else "unavailable"
        self._error: str | None = None
        self._discovered_count = 0
        self._supported_count = 0
        self._unsupported_count = 0
        self._last_scan_at: str | None = None

    async def prepare(self) -> None:
        if not self.enabled or self._backend is not None:
            return
        try:
            self._backend = self._backend_factory()
        except LslUnavailableError as exc:
            self._state = "unavailable"
            self._error = str(exc)
        except Exception as exc:  # Native loading errors must not stop the Hub.
            self._state = "error"
            self._error = f"failed to load pylsl/liblsl: {exc}"
        else:
            self._state = "ready"
            self._error = None

    async def discover(self) -> SensorDiscoveryResult:
        self._last_scan_at = utc_now_iso()
        await self.prepare()
        if self._backend is None:
            return self._result([], scan_succeeded=False)

        try:
            infos = await asyncio.to_thread(
                self._backend.resolve_streams,
                self.discovery_timeout_seconds,
            )
            adapters = [self._make_adapter(info) for info in infos if self._is_supported(info)]
        except Exception as exc:
            self._state = "error"
            self._error = f"LSL discovery failed: {exc}"
            return self._result([], scan_succeeded=False)

        unique_adapters = {adapter.sensor_id: adapter for adapter in adapters}
        self._state = "ready"
        self._error = None
        self._discovered_count = len(infos)
        self._supported_count = len(unique_adapters)
        self._unsupported_count = len(infos) - len(adapters)
        return SensorDiscoveryResult(
            adapters=list(unique_adapters.values()),
            discovered_count=self._discovered_count,
            supported_count=self._supported_count,
            unsupported_count=self._unsupported_count,
            scan_succeeded=True,
        )

    def snapshot(self) -> dict[str, Any]:
        return {
            "providerId": self.provider_id,
            "state": self._state,
            "discoveredCount": self._discovered_count,
            "supportedCount": self._supported_count,
            "unsupportedCount": self._unsupported_count,
            "lastScanAt": self._last_scan_at,
            "error": self._error,
        }

    def _result(
        self,
        adapters: list[LslManagedSensorAdapter],
        *,
        scan_succeeded: bool,
    ) -> SensorDiscoveryResult:
        if scan_succeeded and not adapters:
            self._discovered_count = 0
            self._supported_count = 0
            self._unsupported_count = 0
        return SensorDiscoveryResult(
            adapters=adapters,
            discovered_count=self._discovered_count,
            supported_count=self._supported_count,
            unsupported_count=self._unsupported_count,
            scan_succeeded=scan_succeeded,
        )

    def _make_adapter(self, info: Any) -> LslManagedSensorAdapter:
        assert self._backend is not None
        descriptor = read_stream_descriptor(info, self._backend.channel_format_name(info))
        return LslManagedSensorAdapter(
            backend=self._backend,
            stream_info=info,
            descriptor=descriptor,
            pull_timeout_seconds=self.pull_timeout_seconds,
            time_correction_timeout_seconds=self.time_correction_timeout_seconds,
            max_chunk_samples=self.max_chunk_samples,
        )

    def _is_supported(self, info: Any) -> bool:
        assert self._backend is not None
        channel_format = self._backend.channel_format_name(info)
        stream_type = str(read_info_value(info, "type", "") or "").strip().casefold()
        return (
            channel_format in NUMERIC_CHANNEL_FORMATS
            and stream_type not in UNSUPPORTED_STREAM_TYPES
        )


class LslManagedSensorAdapter:
    adapter_id = "lsl"
    source = "lsl"
    topics = [LSL_RAW_TOPIC]

    def __init__(
        self,
        *,
        backend: LslBackend,
        stream_info: Any,
        descriptor: dict[str, Any],
        pull_timeout_seconds: float = 0.1,
        max_chunk_samples: int = 256,
        correction_refresh_seconds: float = 5.0,
        time_correction_timeout_seconds: float = 2.0,
    ) -> None:
        self._backend = backend
        self._stream_info = stream_info
        self._descriptor = descriptor
        self.pull_timeout_seconds = pull_timeout_seconds
        self.max_chunk_samples = max_chunk_samples
        self.correction_refresh_seconds = correction_refresh_seconds
        self.time_correction_timeout_seconds = time_correction_timeout_seconds
        self.sensor_id = make_lsl_sensor_id(descriptor)
        self.display_name = descriptor["name"]
        self.device_type = descriptor["type"] or "lsl"
        self._inlet: Any | None = None
        self._connected = False
        self._recording_run_id: str | None = None
        self._sequence = 0
        self._time_correction_seconds: float | None = None
        self._last_correction_attempt_monotonic: float | None = None
        self._last_valid_correction_monotonic: float | None = None
        self._sync_status = "warming-up"
        self._sync_reason: str | None = "time-correction-not-read"
        self._last_error: str | None = None
        self._pull_task: asyncio.Task[tuple[list[Any], list[float]]] | None = None
        self._correction_task: asyncio.Task[float] | None = None
        self._pull_lock = asyncio.Lock()

    async def scan(self) -> bool:
        return True

    async def connect(self) -> None:
        if self._connected:
            return
        self._reset_time_correction("time-correction-not-read")
        create_task = asyncio.create_task(
            asyncio.to_thread(self._backend.create_inlet, self._stream_info)
        )
        try:
            inlet = await asyncio.shield(create_task)
        except asyncio.CancelledError as cancellation:
            try:
                inlet = await _await_task_completion(create_task)
            except Exception:
                pass
            else:
                close_task = asyncio.create_task(asyncio.to_thread(self._safe_close, inlet))
                try:
                    await _await_task_completion(close_task)
                except Exception:
                    pass
            raise cancellation

        try:
            await self._run_native_call(self._backend.open_stream, inlet, 2.0)
            self._inlet = inlet
            self._connected = True
            self._last_error = None
            try:
                full_info = await self._run_native_call(self._backend.full_info, inlet, 1.0)
                full_descriptor = read_stream_descriptor(
                    full_info,
                    self._backend.channel_format_name(full_info),
                )
            except Exception:
                pass
            else:
                self._descriptor = full_descriptor
                self.display_name = self._descriptor["name"]
                self.device_type = self._descriptor["type"] or "lsl"
            await self._refresh_time_correction(force=True)
        except BaseException:
            self._connected = False
            self._inlet = None
            self._recording_run_id = None
            self._reset_time_correction("connect-cancelled-or-failed")
            await self._run_native_call(self._safe_close, inlet)
            raise

    async def disconnect(self) -> None:
        inlet = self._inlet
        self._connected = False
        self._recording_run_id = None
        correction_task = self._correction_task
        cleanup_task = asyncio.create_task(
            self._finish_disconnect(inlet, correction_task)
        )
        try:
            await asyncio.shield(cleanup_task)
        except asyncio.CancelledError as cancellation:
            try:
                await _await_task_completion(cleanup_task)
            except Exception:
                pass
            raise cancellation

    async def _finish_disconnect(
        self,
        inlet: Any | None,
        correction_task: asyncio.Task[float] | None,
    ) -> None:
        async with self._pull_lock:
            if correction_task is not None and not correction_task.done():
                try:
                    await asyncio.shield(correction_task)
                except asyncio.CancelledError:
                    pass
                except Exception:
                    pass
            if self._inlet is inlet:
                self._inlet = None
                self._reset_time_correction("disconnected")
            if inlet is not None:
                await self._run_native_call(self._safe_close, inlet)

    async def samples(self) -> AsyncIterator[SensorSample]:
        while self._connected and self._inlet is not None:
            inlet = self._inlet
            samples, timestamps = await self._pull_chunk(inlet)
            if not self._connected or self._inlet is not inlet:
                break
            if not samples:
                await asyncio.sleep(0)
                continue
            await self._refresh_time_correction()
            # Give a fast background refresh one scheduling turn to publish
            # its diagnostic state without waiting for a slow native call.
            await asyncio.sleep(0)
            await self._settle_completed_time_correction()
            yield self._build_chunk(samples, timestamps)

    async def _settle_completed_time_correction(self) -> None:
        task = self._correction_task
        if task is None or not task.done():
            return
        try:
            await task
        except (asyncio.CancelledError, Exception):
            # _read_time_correction records the diagnostic state. A completed
            # task must not make the sample consumer fail because a refresh
            # attempt was unsuccessful.
            return

    async def _pull_chunk(self, inlet: Any) -> tuple[list[Any], list[float]]:
        async with self._pull_lock:
            task = asyncio.create_task(
                asyncio.to_thread(
                    self._backend.pull_chunk,
                    inlet,
                    self.pull_timeout_seconds,
                    self.max_chunk_samples,
                )
            )
            try:
                self._pull_task = task
                return await asyncio.shield(task)
            except asyncio.CancelledError as cancellation:
                try:
                    await _await_task_completion(task)
                except Exception:
                    pass
                raise cancellation
            finally:
                if self._pull_task is task:
                    self._pull_task = None

    async def _run_native_call(self, function: Callable[..., Any], *args: Any) -> Any:
        task = asyncio.create_task(asyncio.to_thread(function, *args))
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError as cancellation:
            try:
                await _await_task_completion(task)
            except Exception:
                pass
            raise cancellation

    async def start_recording(self, run_id: str) -> None:
        inlet = self._inlet
        if not self._connected or inlet is None:
            raise RuntimeError("LSL stream must be connected before recording")
        async with self._pull_lock:
            if not self._connected or self._inlet is not inlet:
                raise RuntimeError("LSL stream disconnected while starting recording")
            await self._run_native_call(self._backend.flush_samples, inlet)
            if not self._connected or self._inlet is not inlet:
                raise RuntimeError("LSL stream disconnected while flushing buffered samples")
            self._recording_run_id = run_id

    async def stop_recording(self, run_id: str) -> None:
        async with self._pull_lock:
            if self._recording_run_id == run_id:
                self._recording_run_id = None

    def status(self) -> dict[str, Any]:
        return {
            "sensorId": self.sensor_id,
            "adapterId": self.adapter_id,
            "source": self.source,
            "displayName": self.display_name,
            "deviceType": self.device_type,
            "topics": list(self.topics),
            "connected": self._connected,
            "recordingRunId": self._recording_run_id,
            "stream": self._descriptor,
            "sync": self._sync_snapshot(),
            "error": self._last_error,
        }

    async def _refresh_time_correction(self, force: bool = False) -> None:
        if self._inlet is None:
            return
        if self._correction_task is not None and not self._correction_task.done():
            if force:
                await asyncio.shield(self._correction_task)
            return
        now = time.monotonic()
        if (
            not force
            and self._last_correction_attempt_monotonic is not None
            and now - self._last_correction_attempt_monotonic < self.correction_refresh_seconds
        ):
            return
        inlet = self._inlet
        if inlet is None:
            return
        task = asyncio.create_task(self._read_time_correction(inlet))
        self._correction_task = task
        if force:
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError as cancellation:
                try:
                    await _await_task_completion(task)
                except Exception:
                    pass
                raise cancellation

    async def _read_time_correction(self, inlet: Any) -> float:
        task = asyncio.create_task(
            asyncio.to_thread(
                self._backend.time_correction,
                inlet,
                self.time_correction_timeout_seconds,
            )
        )
        try:
            correction = await asyncio.shield(task)
            if not math.isfinite(correction):
                raise ValueError("time correction is not finite")
        except asyncio.CancelledError as cancellation:
            try:
                await _await_task_completion(task)
            except Exception:
                pass
            raise cancellation
        except Exception as exc:
            if (
                self._time_correction_seconds is not None
                and self._last_valid_correction_monotonic is not None
            ):
                self._sync_status = "stale"
                self._sync_reason = f"time-correction-refresh-failed: {exc}"
            else:
                self._time_correction_seconds = None
                self._sync_status = "warming-up"
                self._sync_reason = str(exc)
            return 0.0
        else:
            self._time_correction_seconds = correction
            self._sync_status = "corrected"
            self._sync_reason = None
            self._last_valid_correction_monotonic = time.monotonic()
            return correction
        finally:
            if self._correction_task is asyncio.current_task():
                self._correction_task = None
            self._last_correction_attempt_monotonic = time.monotonic()

    def _build_chunk(self, raw_samples: list[Any], timestamps: list[float]) -> SensorSample:
        self._sequence += 1
        arrival_lsl_clock = self._backend.local_clock()
        arrival_utc = datetime.now(UTC)
        arrival_utc_iso = format_utc(arrival_utc)
        encoded_samples: list[dict[str, Any]] = []
        fallback_reasons: set[str] = set()
        lsl_timestamps = [
            read_finite_timestamp(timestamps, index)
            for index in range(len(raw_samples))
        ]
        valid_lsl_timestamps = [
            timestamp for timestamp in lsl_timestamps if timestamp is not None
        ]
        relative_arrival_anchor = (
            max(valid_lsl_timestamps)
            if self._time_correction_seconds is None and len(valid_lsl_timestamps) >= 2
            else None
        )

        for index, values in enumerate(raw_samples):
            lsl_timestamp = lsl_timestamps[index]
            if lsl_timestamp is None:
                fallback_reasons.add("missing-or-invalid-lsl-timestamp")
            corrected: float | None = None
            sample_collected_at_source = "arrival-utc"
            if lsl_timestamp is not None and self._time_correction_seconds is not None:
                corrected_candidate = lsl_timestamp + self._time_correction_seconds
                if math.isfinite(corrected_candidate):
                    corrected = corrected_candidate
                else:
                    fallback_reasons.add("invalid-corrected-lsl-timestamp")
            if corrected is not None:
                try:
                    collected_at = map_lsl_timestamp_to_utc(
                        corrected,
                        arrival_lsl_clock=arrival_lsl_clock,
                        arrival_utc=arrival_utc,
                    )
                    sample_collected_at_source = "corrected-lsl-delta"
                except (OverflowError, OSError, ValueError):
                    collected_at = arrival_utc_iso
                    fallback_reasons.add("utc-conversion-out-of-range")
            elif lsl_timestamp is not None and relative_arrival_anchor is not None:
                try:
                    collected_at = format_utc(
                        arrival_utc
                        + timedelta(seconds=lsl_timestamp - relative_arrival_anchor)
                    )
                    sample_collected_at_source = "arrival-utc-anchored-lsl-delta"
                except (OverflowError, OSError, ValueError):
                    collected_at = arrival_utc_iso
                    fallback_reasons.add("relative-lsl-spacing-out-of-range")
            else:
                collected_at = arrival_utc_iso
            encoded_samples.append(
                {
                    "values": normalize_numeric_values(values),
                    "lslTimestamp": lsl_timestamp,
                    "correctedLslTimestamp": corrected,
                    "collectedAt": collected_at,
                    "collectedAtSource": sample_collected_at_source,
                }
            )

        collected_at_sources = {
            sample["collectedAtSource"] for sample in encoded_samples
        }
        collected_at_source = (
            next(iter(collected_at_sources))
            if len(collected_at_sources) == 1
            else "mixed"
        )
        sync = self._sync_snapshot() | {
            "arrivalLslClock": arrival_lsl_clock,
            "arrivalUtc": arrival_utc_iso,
            "collectedAtSource": collected_at_source,
        }
        if fallback_reasons:
            sync["correctionStatus"] = sync["status"]
            sync["correctionReason"] = sync["reason"]
            sync["status"] = "fallback"
            sync["reason"] = ",".join(sorted(fallback_reasons))
        last_sample = encoded_samples[-1]
        payload = {
            "source": self.source,
            "stream": self._descriptor,
            "sequence": self._sequence,
            "sampleCount": len(encoded_samples),
            "samples": encoded_samples,
            "sync": sync,
        }
        preview = {
            "source": self.source,
            "sequence": self._sequence,
            "sampleCount": len(encoded_samples),
            "values": last_sample["values"],
            "lslTimestamp": last_sample["lslTimestamp"],
            "correctedLslTimestamp": last_sample["correctedLslTimestamp"],
            "stream": {
                "name": self._descriptor["name"],
                "type": self._descriptor["type"],
                "channelCount": self._descriptor["channelCount"],
                "nominalSrateHz": self._descriptor["nominalSrateHz"],
            },
            "sync": sync,
        }
        return SensorSample(
            topic=LSL_RAW_TOPIC,
            payload=payload,
            preview_payload=preview,
            collected_at=last_sample["collectedAt"],
        )

    def _sync_snapshot(self) -> dict[str, Any]:
        correction_age_seconds = None
        if self._last_valid_correction_monotonic is not None:
            correction_age_seconds = max(
                0.0,
                time.monotonic() - self._last_valid_correction_monotonic,
            )
        return {
            "status": self._sync_status,
            "timeCorrectionSec": self._time_correction_seconds,
            "timeCorrectionAgeSec": correction_age_seconds,
            "reason": self._sync_reason,
        }

    def _reset_time_correction(self, reason: str) -> None:
        self._time_correction_seconds = None
        self._last_correction_attempt_monotonic = None
        self._last_valid_correction_monotonic = None
        self._sync_status = "warming-up"
        self._sync_reason = reason

    def _safe_close(self, inlet: Any) -> None:
        try:
            self._backend.close_stream(inlet)
        except Exception:
            pass


def read_stream_descriptor(info: Any, channel_format: str) -> dict[str, Any]:
    channel_count = int(read_info_value(info, "channel_count", 0) or 0)
    channels = read_channel_metadata(info, channel_count)
    hostname = str(read_info_value(info, "hostname", "") or "")
    return {
        "name": str(read_info_value(info, "name", "Unnamed LSL stream") or "Unnamed LSL stream"),
        "type": str(read_info_value(info, "type", "") or ""),
        "uid": str(read_info_value(info, "uid", "") or ""),
        "sourceId": str(read_info_value(info, "source_id", "") or ""),
        "host": hostname,
        "hostname": hostname,
        "channelCount": channel_count,
        "nominalSrateHz": float(read_info_value(info, "nominal_srate", 0.0) or 0.0),
        "channelFormat": channel_format,
        "channels": channels,
    }


def read_info_value(info: Any, name: str, default: Any) -> Any:
    value = getattr(info, name, None)
    if not callable(value):
        return default
    try:
        return value()
    except Exception:
        return default


def read_channel_metadata(info: Any, channel_count: int) -> list[dict[str, str | None]]:
    channels: list[dict[str, str | None]] = []
    try:
        node = info.desc().child("channels").child("channel")
        while node is not None and not node.empty() and len(channels) < channel_count:
            channels.append(
                {
                    "label": node.child_value("label") or f"channel-{len(channels) + 1}",
                    "unit": node.child_value("unit") or None,
                    "type": node.child_value("type") or None,
                }
            )
            node = node.next_sibling()
    except Exception:
        channels = []
    while len(channels) < channel_count:
        channels.append(
            {
                "label": f"channel-{len(channels) + 1}",
                "unit": None,
                "type": None,
            }
        )
    return channels


def make_lsl_sensor_id(descriptor: dict[str, Any]) -> str:
    source_id = str(descriptor.get("sourceId") or "").strip()
    if source_id:
        identity = "\x1f".join(
            [source_id, str(descriptor.get("name") or ""), str(descriptor.get("type") or "")]
        )
    else:
        uid = str(descriptor.get("uid") or "").strip()
        identity = uid or "\x1f".join(
            [
                str(descriptor.get("name") or ""),
                str(descriptor.get("type") or ""),
                str(descriptor.get("hostname") or ""),
            ]
        )
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:12]
    return f"lsl-{digest}"


def normalize_numeric_values(values: Any) -> list[int | float]:
    raw_values = values if isinstance(values, (list, tuple)) else [values]
    normalized: list[int | float] = []
    for value in raw_values:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("LSL numeric stream produced a non-numeric sample")
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("LSL numeric stream produced a non-finite sample")
        normalized.append(value)
    return normalized


def read_finite_timestamp(timestamps: list[float], index: int) -> float | None:
    if index >= len(timestamps):
        return None
    try:
        timestamp = float(timestamps[index])
    except (TypeError, ValueError):
        return None
    return timestamp if math.isfinite(timestamp) else None


def map_lsl_timestamp_to_utc(
    corrected_lsl_timestamp: float,
    *,
    arrival_lsl_clock: float,
    arrival_utc: datetime,
) -> str:
    delta_seconds = corrected_lsl_timestamp - arrival_lsl_clock
    return format_utc(arrival_utc + timedelta(seconds=delta_seconds))


def format_utc(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
