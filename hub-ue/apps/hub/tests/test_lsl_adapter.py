from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import tempfile
import time
import unittest
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from biofeedback_hub.adapters.lsl import (
    LSL_RAW_TOPIC,
    LslDiscoveryProvider,
    LslUnavailableError,
    make_lsl_sensor_id,
    map_lsl_timestamp_to_utc,
    normalize_numeric_values,
)
from biofeedback_hub.config import HubConfig
from biofeedback_hub.core.broker import TopicBroker
from biofeedback_hub.core.runtime import HubRuntime
from biofeedback_hub.core.sensor_manager import SensorManager
from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.main import create_app
from biofeedback_hub.schemas.envelope import ClientHello, ClientRole, MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic
from biofeedback_hub.tools.lsl_sim import build_parser, make_sample


class LslProviderTest(unittest.IsolatedAsyncioTestCase):
    async def test_provider_load_is_lazy_and_missing_dependency_is_visible(self) -> None:
        calls = 0

        def unavailable_backend() -> FakeBackend:
            nonlocal calls
            calls += 1
            raise LslUnavailableError("pylsl is missing")

        provider = LslDiscoveryProvider(backend_factory=unavailable_backend)

        self.assertEqual(calls, 0)
        self.assertEqual(provider.snapshot()["state"], "unavailable")

        await provider.prepare()

        self.assertEqual(calls, 1)
        self.assertEqual(provider.snapshot()["state"], "unavailable")
        self.assertIn("pylsl is missing", provider.snapshot()["error"])

    async def test_discovery_creates_every_numeric_stream_and_counts_string(self) -> None:
        backend = FakeBackend(
            infos=[
                FakeInfo(name="ECG", stream_type="ECG", channel_format="float32", source_id="polar"),
                FakeInfo(name="IMU", stream_type="Accelerometer", channel_format="int16", source_id="imu"),
                FakeInfo(name="Markers", stream_type="Markers", channel_format="string", source_id="events"),
                FakeInfo(name="Numeric Markers", stream_type="Markers", channel_format="int32", source_id="events-numeric"),
            ]
        )
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)

        result = await provider.discover()

        self.assertEqual(result.discovered_count, 4)
        self.assertEqual(result.supported_count, 2)
        self.assertEqual(result.unsupported_count, 2)
        self.assertEqual({adapter.display_name for adapter in result.adapters}, {"ECG", "IMU"})
        self.assertTrue(all(adapter.topics == [LSL_RAW_TOPIC] for adapter in result.adapters))
        self.assertEqual(provider.snapshot()["state"], "ready")

    async def test_native_library_load_failure_is_reported_without_raising(self) -> None:
        def invalid_native_library() -> FakeBackend:
            raise OSError("liblsl DLL could not be loaded")

        provider = LslDiscoveryProvider(backend_factory=invalid_native_library)

        await provider.prepare()

        snapshot = provider.snapshot()
        self.assertEqual(snapshot["state"], "error")
        self.assertIn("liblsl DLL could not be loaded", snapshot["error"])

    async def test_duplicate_discovery_results_create_one_sensor_identity(self) -> None:
        first = FakeInfo(
            name="ECG",
            stream_type="ECG",
            channel_format="float32",
            source_id="polar",
            uid="uid-a",
        )
        duplicate = FakeInfo(
            name="ECG",
            stream_type="ECG",
            channel_format="float32",
            source_id="polar",
            uid="uid-b",
        )
        provider = LslDiscoveryProvider(
            backend_factory=lambda: FakeBackend(infos=[first, duplicate])
        )

        result = await provider.discover()

        self.assertEqual(result.discovered_count, 2)
        self.assertEqual(result.supported_count, 1)
        self.assertEqual(result.unsupported_count, 0)
        self.assertEqual(len(result.adapters), 1)

    async def test_sensor_identity_uses_source_tuple_then_uid_fallback(self) -> None:
        source_descriptor = {
            "sourceId": "source-1",
            "name": "ECG",
            "type": "ECG",
            "uid": "uid-a",
            "hostname": "lab",
        }
        same_source = source_descriptor | {"uid": "uid-b"}
        uid_fallback = source_descriptor | {"sourceId": "", "uid": "uid-a"}
        other_uid = uid_fallback | {"uid": "uid-b"}

        self.assertEqual(make_lsl_sensor_id(source_descriptor), make_lsl_sensor_id(same_source))
        self.assertNotEqual(make_lsl_sensor_id(uid_fallback), make_lsl_sensor_id(other_uid))

    async def test_disappearing_stream_keeps_identity_when_it_returns(self) -> None:
        info = FakeInfo(name="ECG", stream_type="ECG", channel_format="float32", source_id="stable")
        backend = FakeBackend(infos=[info])
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)

        first = await provider.discover()
        sensor_id = first.adapters[0].sensor_id
        backend.infos = []
        empty = await provider.discover()
        backend.infos = [info]
        returned = await provider.discover()

        self.assertEqual(empty.adapters, [])
        self.assertEqual(returned.adapters[0].sensor_id, sensor_id)

    async def test_transient_discovery_failure_preserves_previous_inventory(self) -> None:
        info = FakeInfo(name="ECG", stream_type="ECG", channel_format="float32", source_id="stable")
        backend = FakeBackend(infos=[info])
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)

        first = await provider.discover()
        backend.resolve_error = RuntimeError("temporary resolver failure")
        failed = await provider.discover()

        self.assertTrue(first.scan_succeeded)
        self.assertFalse(failed.scan_succeeded)
        self.assertEqual(failed.adapters, [])
        self.assertEqual(failed.discovered_count, 1)
        self.assertEqual(failed.supported_count, 1)
        self.assertEqual(provider.snapshot()["state"], "error")


class LslAdapterTest(unittest.IsolatedAsyncioTestCase):
    def test_non_finite_channel_values_are_rejected(self) -> None:
        for value in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "non-finite"):
                    normalize_numeric_values([value])

    def test_lsl_clock_delta_is_anchored_to_arrival_utc(self) -> None:
        arrival_utc = datetime(2026, 8, 4, 12, 0, 0, tzinfo=UTC)

        collected_at = map_lsl_timestamp_to_utc(
            4999.75,
            arrival_lsl_clock=5000.0,
            arrival_utc=arrival_utc,
        )

        self.assertEqual(collected_at, "2026-08-04T11:59:59.750000Z")

    async def test_chunk_preserves_raw_corrected_and_utc_timestamps(self) -> None:
        info = FakeInfo(
            name="Biofeedback Hub Test",
            stream_type="TestSignal",
            channel_format="float32",
            source_id="test-source",
            channels=[("signal_a", "a.u.", "synthetic"), ("signal_b", "a.u.", "synthetic")],
        )
        backend = FakeBackend(infos=[info], time_correction=0.25)
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        backend.push_chunk([[0.25, 0.75], [0.5, 0.5]], [1000.0, 1000.1])
        iterator = adapter.samples()

        sample = await asyncio.wait_for(anext(iterator), timeout=1)

        self.assertEqual(sample.topic, LSL_RAW_TOPIC)
        self.assertEqual(sample.payload["sampleCount"], 2)
        self.assertEqual(sample.payload["stream"]["channels"][0]["label"], "signal_a")
        self.assertEqual(sample.payload["stream"]["host"], "test-host")
        self.assertEqual(sample.payload["samples"][0]["lslTimestamp"], 1000.0)
        self.assertEqual(sample.payload["samples"][0]["correctedLslTimestamp"], 1000.25)
        self.assertNotIn("1970-", sample.payload["samples"][0]["collectedAt"])
        self.assertEqual(sample.payload["sync"]["collectedAtSource"], "corrected-lsl-delta")
        self.assertEqual(sample.payload["sync"]["status"], "corrected")
        self.assertEqual(sample.payload["sync"]["timeCorrectionSec"], 0.25)
        self.assertIsNotNone(sample.payload["sync"]["timeCorrectionAgeSec"])
        self.assertGreaterEqual(sample.payload["sync"]["timeCorrectionAgeSec"], 0.0)
        self.assertNotIn("samples", sample.preview_payload or {})
        self.assertEqual((sample.preview_payload or {})["values"], [0.5, 0.5])

        await iterator.aclose()
        await adapter.disconnect()

    async def test_start_recording_flushes_samples_buffered_before_attach(self) -> None:
        info = FakeInfo(
            name="Buffered",
            stream_type="Signal",
            channel_format="float32",
            source_id="buffered",
        )
        backend = FakeBackend(infos=[info])
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        iterator = adapter.samples()
        try:
            backend.push_chunk([[1.0]], [1000.0])
            await adapter.start_recording("run-buffer")

            self.assertEqual(backend.flush_calls, 1)
            self.assertEqual(backend.flushed_sample_count, 1)

            backend.push_chunk([[2.0]], [1000.1])
            sample = await asyncio.wait_for(anext(iterator), timeout=1)
            self.assertEqual(sample.payload["sampleCount"], 1)
            self.assertEqual(sample.payload["samples"][0]["values"], [2.0])
        finally:
            await iterator.aclose()
            await adapter.disconnect()

    async def test_disconnect_waits_for_flush_and_prevents_stale_recording_state(self) -> None:
        info = FakeInfo(
            name="Flush race",
            stream_type="Signal",
            channel_format="float32",
            source_id="flush-race",
        )
        backend = BlockingFlushBackend(infos=[info])
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()

        start_task = asyncio.create_task(adapter.start_recording("run-race"))
        await asyncio.wait_for(asyncio.to_thread(backend.flush_started.wait), timeout=1)
        disconnect_task = asyncio.create_task(adapter.disconnect())
        await asyncio.sleep(0)

        self.assertFalse(disconnect_task.done())
        self.assertFalse(backend.close_while_flush_active)

        backend.release_flush.set()
        with self.assertRaisesRegex(RuntimeError, "disconnected while flushing"):
            await start_task
        await disconnect_task

        self.assertFalse(backend.close_while_flush_active)
        self.assertFalse(adapter.status()["connected"])
        self.assertIsNone(adapter.status()["recordingRunId"])

    async def test_connect_refreshes_full_channel_metadata_from_inlet(self) -> None:
        discovery_info = FakeInfo(
            name="Biofeedback Hub Test",
            stream_type="TestSignal",
            channel_format="float32",
            source_id="test-source",
            channels=[],
            channel_count=2,
        )
        full_info = FakeInfo(
            name="Biofeedback Hub Test",
            stream_type="TestSignal",
            channel_format="float32",
            source_id="test-source",
            channels=[("signal_a", "a.u.", "synthetic"), ("signal_b", "a.u.", "synthetic")],
        )
        backend = FakeBackend(infos=[discovery_info], full_info=full_info)
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]

        self.assertEqual(adapter.status()["stream"]["channels"][0]["label"], "channel-1")

        await adapter.connect()

        self.assertEqual(adapter.status()["stream"]["channels"][0], {
            "label": "signal_a",
            "unit": "a.u.",
            "type": "synthetic",
        })
        await adapter.disconnect()

    async def test_zero_time_correction_is_a_valid_measurement(self) -> None:
        info = FakeInfo(name="EEG", stream_type="EEG", channel_format="double64", uid="uid-eeg")
        backend = FakeBackend(infos=[info], time_correction=0.0)
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        backend.push_chunk([[1.0]], [2000.0])
        iterator = adapter.samples()

        sample = await asyncio.wait_for(anext(iterator), timeout=1)

        self.assertEqual(sample.payload["sync"]["status"], "corrected")
        self.assertEqual(sample.payload["sync"]["timeCorrectionSec"], 0.0)
        self.assertEqual(sample.payload["samples"][0]["correctedLslTimestamp"], 2000.0)
        await iterator.aclose()
        await adapter.disconnect()

    async def test_provider_forwards_configured_time_correction_timeout(self) -> None:
        info = FakeInfo(name="EEG", stream_type="EEG", channel_format="float32", uid="uid-timeout")
        backend = FakeBackend(infos=[info], time_correction=0.0)
        provider = LslDiscoveryProvider(
            backend_factory=lambda: backend,
            time_correction_timeout_seconds=2.5,
        )
        adapter = (await provider.discover()).adapters[0]

        await adapter.connect()

        self.assertEqual(backend.time_correction_timeouts, [2.5])
        await adapter.disconnect()

    async def test_transient_time_correction_failure_keeps_last_valid_correction_as_stale(
        self,
    ) -> None:
        info = FakeInfo(name="EEG", stream_type="EEG", channel_format="float32", uid="uid-eeg")
        backend = FakeBackend(infos=[info], time_correction=0.25)
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        adapter.correction_refresh_seconds = 0.0
        await adapter.connect()
        backend.correction = RuntimeError("temporary clock failure")
        backend.push_chunk([[1.0]], [2500.0])
        iterator = adapter.samples()

        sample = await asyncio.wait_for(anext(iterator), timeout=1)
        await wait_for_sync_status(adapter, "stale")
        backend.push_chunk([[2.0]], [2500.1])
        sample = await asyncio.wait_for(anext(iterator), timeout=1)

        sync = sample.payload["sync"]
        self.assertEqual(sync["status"], "stale")
        self.assertEqual(sync["timeCorrectionSec"], 0.25)
        self.assertIsNotNone(sync["timeCorrectionAgeSec"])
        self.assertGreaterEqual(sync["timeCorrectionAgeSec"], 0.0)
        self.assertIn("temporary clock failure", sync["reason"])
        self.assertEqual(sync["collectedAtSource"], "corrected-lsl-delta")
        self.assertEqual(sample.payload["samples"][0]["lslTimestamp"], 2500.1)
        self.assertEqual(sample.payload["samples"][0]["correctedLslTimestamp"], 2500.35)
        self.assertEqual(adapter.status()["sync"]["status"], "stale")
        await iterator.aclose()
        await adapter.disconnect()

    async def test_time_correction_failure_preserves_raw_timestamp(self) -> None:
        info = FakeInfo(name="EEG", stream_type="EEG", channel_format="float32", uid="uid-eeg")
        backend = FakeBackend(infos=[info], time_correction=RuntimeError("clock warming up"))
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        backend.push_chunk([[1.0]], [3000.0])
        iterator = adapter.samples()

        sample = await asyncio.wait_for(anext(iterator), timeout=1)

        self.assertEqual(sample.payload["sync"]["status"], "warming-up")
        self.assertEqual(sample.payload["sync"]["collectedAtSource"], "arrival-utc")
        self.assertIsNone(sample.payload["sync"]["timeCorrectionAgeSec"])
        self.assertIsNone(sample.payload["samples"][0]["correctedLslTimestamp"])
        self.assertEqual(sample.payload["samples"][0]["lslTimestamp"], 3000.0)
        self.assertEqual(
            sample.payload["samples"][0]["collectedAt"],
            sample.payload["sync"]["arrivalUtc"],
        )
        self.assertIn("clock warming up", sample.payload["sync"]["reason"])
        await iterator.aclose()
        await adapter.disconnect()

    async def test_reconnect_discards_old_correction_and_anchors_fallback_batch_to_arrival(
        self,
    ) -> None:
        info = FakeInfo(name="EEG", stream_type="EEG", channel_format="float32", uid="uid-eeg")
        backend = FakeBackend(infos=[info], time_correction=0.5)
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        self.assertEqual(adapter.status()["sync"]["status"], "corrected")
        await adapter.disconnect()

        backend.correction = RuntimeError("clock unavailable after restart")
        await adapter.connect()
        backend.push_chunk([[1.0], [2.0], [3.0]], [3100.0, 3100.1, 3100.2])
        iterator = adapter.samples()

        sample = await asyncio.wait_for(anext(iterator), timeout=1)

        sync = sample.payload["sync"]
        samples = sample.payload["samples"]
        self.assertEqual(sync["status"], "warming-up")
        self.assertIsNone(sync["timeCorrectionSec"])
        self.assertIsNone(sync["timeCorrectionAgeSec"])
        self.assertIn("clock unavailable after restart", sync["reason"])
        self.assertEqual(sync["collectedAtSource"], "arrival-utc-anchored-lsl-delta")
        self.assertEqual([item["lslTimestamp"] for item in samples], [3100.0, 3100.1, 3100.2])
        self.assertTrue(all(item["correctedLslTimestamp"] is None for item in samples))
        self.assertEqual(samples[-1]["collectedAt"], sync["arrivalUtc"])
        first_collected_at = datetime.fromisoformat(samples[0]["collectedAt"].replace("Z", "+00:00"))
        last_collected_at = datetime.fromisoformat(samples[-1]["collectedAt"].replace("Z", "+00:00"))
        self.assertAlmostEqual((last_collected_at - first_collected_at).total_seconds(), 0.2, places=5)
        await iterator.aclose()
        await adapter.disconnect()

    async def test_missing_lsl_timestamp_uses_declared_arrival_fallback(self) -> None:
        info = FakeInfo(name="EEG", stream_type="EEG", channel_format="float32", uid="uid-eeg")
        backend = FakeBackend(infos=[info], time_correction=0.01)
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        backend.push_chunk([[1.0]], [])
        iterator = adapter.samples()

        sample = await asyncio.wait_for(anext(iterator), timeout=1)

        self.assertEqual(sample.payload["sync"]["status"], "fallback")
        self.assertEqual(sample.payload["sync"]["reason"], "missing-or-invalid-lsl-timestamp")
        self.assertEqual(sample.payload["sync"]["collectedAtSource"], "arrival-utc")
        self.assertIsNone(sample.payload["samples"][0]["lslTimestamp"])
        self.assertIsNone(sample.payload["samples"][0]["correctedLslTimestamp"])
        self.assertEqual(
            sample.payload["samples"][0]["collectedAt"],
            sample.payload["sync"]["arrivalUtc"],
        )
        await iterator.aclose()
        await adapter.disconnect()

    async def test_mixed_timestamp_batch_declares_each_sample_source(self) -> None:
        info = FakeInfo(name="EEG", stream_type="EEG", channel_format="float32", uid="uid-eeg")
        backend = FakeBackend(infos=[info], time_correction=0.01)
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        backend.push_chunk([[1.0], [2.0]], [4000.0, float("nan")])
        iterator = adapter.samples()

        sample = await asyncio.wait_for(anext(iterator), timeout=1)

        sync = sample.payload["sync"]
        samples = sample.payload["samples"]
        self.assertEqual(sync["status"], "fallback")
        self.assertEqual(sync["collectedAtSource"], "mixed")
        self.assertIsNotNone(sync["timeCorrectionAgeSec"])
        self.assertEqual(
            [item["collectedAtSource"] for item in samples],
            ["corrected-lsl-delta", "arrival-utc"],
        )
        await iterator.aclose()
        await adapter.disconnect()

    async def test_timestamp_fallback_preserves_stale_correction_diagnostic(self) -> None:
        info = FakeInfo(name="EEG", stream_type="EEG", channel_format="float32", uid="uid-eeg")
        backend = FakeBackend(infos=[info], time_correction=0.25)
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        adapter.correction_refresh_seconds = 0.0
        backend.correction = RuntimeError("clock refresh failed")
        backend.push_chunk([[1.0], [2.0]], [4100.0, float("nan")])
        iterator = adapter.samples()

        sample = await asyncio.wait_for(anext(iterator), timeout=1)
        await wait_for_sync_status(adapter, "stale")
        backend.push_chunk([[3.0]], [float("nan")])
        sample = await asyncio.wait_for(anext(iterator), timeout=1)

        sync = sample.payload["sync"]
        self.assertEqual(sync["status"], "fallback")
        self.assertEqual(sync["correctionStatus"], "stale")
        self.assertIn("clock refresh failed", sync["correctionReason"])
        self.assertIn("missing-or-invalid-lsl-timestamp", sync["reason"])
        await iterator.aclose()
        await adapter.disconnect()

    async def test_out_of_range_utc_mapping_uses_declared_arrival_fallback(self) -> None:
        info = FakeInfo(name="EEG", stream_type="EEG", channel_format="float32", uid="uid-eeg")
        backend = FakeBackend(infos=[info], time_correction=0.0)
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        backend.push_chunk([[1.0]], [1e300])
        iterator = adapter.samples()

        sample = await asyncio.wait_for(anext(iterator), timeout=1)

        self.assertEqual(sample.payload["sync"]["status"], "fallback")
        self.assertEqual(sample.payload["sync"]["reason"], "utc-conversion-out-of-range")
        self.assertEqual(sample.payload["samples"][0]["lslTimestamp"], 1e300)
        self.assertEqual(sample.payload["samples"][0]["correctedLslTimestamp"], 1e300)
        self.assertEqual(
            sample.payload["samples"][0]["collectedAt"],
            sample.payload["sync"]["arrivalUtc"],
        )
        await iterator.aclose()
        await adapter.disconnect()

    async def test_cancelled_pull_finishes_before_inlet_is_closed(self) -> None:
        info = FakeInfo(
            name="Blocking",
            stream_type="Signal",
            channel_format="float32",
            source_id="blocking",
        )
        backend = BlockingPullBackend(infos=[info])
        provider = LslDiscoveryProvider(
            backend_factory=lambda: backend,
            pull_timeout_seconds=0.2,
        )
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        iterator = adapter.samples()
        pending = asyncio.create_task(anext(iterator))
        await asyncio.wait_for(asyncio.to_thread(backend.pull_started.wait), timeout=1)

        pending.cancel()
        await asyncio.sleep(0)
        pending.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await pending
        await adapter.disconnect()

        self.assertFalse(backend.close_while_pull_active)

    async def test_cancelled_time_correction_finishes_before_inlet_is_closed(self) -> None:
        info = FakeInfo(
            name="Blocking correction",
            stream_type="Signal",
            channel_format="float32",
            source_id="blocking-correction",
        )
        backend = BlockingCorrectionBackend(infos=[info])
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        adapter.correction_refresh_seconds = 0.0
        backend.block_correction = True
        backend.push_chunk([[1.0]], [5000.0])
        iterator = adapter.samples()
        pending = asyncio.create_task(anext(iterator))
        await asyncio.wait_for(asyncio.to_thread(backend.correction_started.wait), timeout=1)

        sample = await asyncio.wait_for(pending, timeout=1)
        self.assertEqual(sample.payload["sync"]["status"], "corrected")
        disconnect_task = asyncio.create_task(adapter.disconnect())
        await asyncio.sleep(0.01)
        self.assertFalse(backend.close_while_correction_active)
        backend.release_correction.set()

        await disconnect_task
        self.assertFalse(backend.close_while_correction_active)

    async def test_repeatedly_cancelled_disconnect_still_waits_and_closes_inlet(self) -> None:
        info = FakeInfo(
            name="Blocking disconnect",
            stream_type="Signal",
            channel_format="float32",
            source_id="blocking-disconnect",
        )
        backend = BlockingCorrectionBackend(infos=[info])
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        adapter = (await provider.discover()).adapters[0]
        await adapter.connect()
        adapter.correction_refresh_seconds = 0.0
        backend.block_correction = True
        backend.push_chunk([[1.0]], [5000.0])
        iterator = adapter.samples()
        pending = asyncio.create_task(anext(iterator))
        await asyncio.wait_for(asyncio.to_thread(backend.correction_started.wait), timeout=1)

        disconnect_task = asyncio.create_task(adapter.disconnect())
        await asyncio.sleep(0)
        disconnect_task.cancel()
        await asyncio.sleep(0)
        disconnect_task.cancel()
        self.assertFalse(disconnect_task.done())
        self.assertFalse(backend.close_while_correction_active)
        backend.release_correction.set()

        with self.assertRaises(asyncio.CancelledError):
            await disconnect_task
        await pending
        await iterator.aclose()
        self.assertFalse(adapter.status()["connected"])
        self.assertFalse(backend.close_while_correction_active)

    async def test_cancelled_connect_finishes_native_stage_and_closes_inlet(self) -> None:
        for stage in ("create", "open", "full_info"):
            with self.subTest(stage=stage):
                info = FakeInfo(
                    name=f"Blocking {stage}",
                    stream_type="Signal",
                    channel_format="float32",
                    source_id=f"blocking-{stage}",
                )
                backend = BlockingConnectBackend(stage=stage, infos=[info])
                provider = LslDiscoveryProvider(backend_factory=lambda: backend)
                adapter = (await provider.discover()).adapters[0]
                connect_task = asyncio.create_task(adapter.connect())
                await asyncio.wait_for(
                    asyncio.to_thread(backend.stage_started.wait),
                    timeout=1,
                )

                connect_task.cancel()
                await asyncio.sleep(0)
                connect_task.cancel()
                await asyncio.sleep(0)
                self.assertFalse(connect_task.done())
                backend.release_stage.set()
                with self.assertRaises(asyncio.CancelledError):
                    await connect_task

                self.assertFalse(adapter.status()["connected"])
                self.assertEqual(backend.close_count, 1)


class LslSensorManagerTest(unittest.IsolatedAsyncioTestCase):
    async def test_scan_reuses_card_after_stream_disappears_and_returns(self) -> None:
        info = FakeInfo(
            name="Stable stream",
            stream_type="Signal",
            channel_format="float32",
            source_id="stable-source",
        )
        backend = FakeBackend(infos=[info])
        provider = LslDiscoveryProvider(backend_factory=lambda: backend)
        broker = TopicBroker()
        with tempfile.TemporaryDirectory() as tmpdir:
            runtime = HubRuntime(
                broker=broker,
                session_logger=JsonlSessionLogger(Path(tmpdir), "session-test"),
            )
            manager = SensorManager(
                broker=broker,
                runtime=runtime,
                adapters=[],
                providers=[provider],
            )
            controller = await broker.connect(
                ClientHello(clientId="dashboard-controller", role=ClientRole.CONTROLLER)
            )
            await manager.start()
            try:
                await send_command(runtime, "sensor.scan")
                await next_message(controller, message_type=MessageType.ACK)
                first = manager.snapshot()["sensors"]
                self.assertEqual(len(first), 1)
                sensor_id = first[0]["sensorId"]
                self.assertEqual(first[0]["state"], "available")

                backend.resolve_error = RuntimeError("temporary resolver failure")
                await send_command(runtime, "sensor.scan")
                await next_message(controller, message_type=MessageType.ACK)
                failed_scan = manager.snapshot()["sensors"]
                self.assertEqual(failed_scan[0]["sensorId"], sensor_id)
                self.assertEqual(failed_scan[0]["state"], "available")

                backend.resolve_error = None
                backend.infos = []
                await send_command(runtime, "sensor.scan")
                await next_message(controller, message_type=MessageType.ACK)
                missing = manager.snapshot()["sensors"]
                self.assertEqual(len(missing), 1)
                self.assertEqual(missing[0]["sensorId"], sensor_id)
                self.assertEqual(missing[0]["state"], "disconnected")

                backend.infos = [info]
                await send_command(runtime, "sensor.scan")
                await next_message(controller, message_type=MessageType.ACK)
                returned = manager.snapshot()["sensors"]
                self.assertEqual(len(returned), 1)
                self.assertEqual(returned[0]["sensorId"], sensor_id)
                self.assertEqual(returned[0]["state"], "available")
            finally:
                await manager.stop()

    async def test_dynamic_lsl_preview_and_attached_recording_gate(self) -> None:
        info = FakeInfo(name="Test", stream_type="Signal", channel_format="float32", source_id="test")
        backend = FakeBackend(infos=[info], time_correction=0.01)
        provider = LslDiscoveryProvider(
            backend_factory=lambda: backend,
            pull_timeout_seconds=0.01,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            broker = TopicBroker()
            logger = JsonlSessionLogger(Path(tmpdir), "session-test")
            runtime = HubRuntime(broker=broker, session_logger=logger)
            manager = SensorManager(
                broker=broker,
                runtime=runtime,
                adapters=[],
                providers=[provider],
                preview_interval_seconds=0.0,
            )
            controller = await broker.connect(
                ClientHello(clientId="dashboard-controller", role=ClientRole.CONTROLLER)
            )
            dashboard = await broker.connect(
                ClientHello(clientId="dashboard-ui", role=ClientRole.DASHBOARD)
            )
            await broker.subscribe(
                "dashboard-ui",
                {
                    Topic.SENSOR_PREVIEW.value,
                    Topic.SENSOR_SESSION.value,
                    LSL_RAW_TOPIC,
                },
            )
            await manager.start()
            try:
                await send_command(runtime, "sensor.scan")
                await next_message(controller, message_type=MessageType.ACK)
                snapshot = manager.snapshot()
                sensor_id = snapshot["sensors"][0]["sensorId"]
                self.assertEqual(snapshot["providers"][0]["supportedCount"], 1)

                await send_command(runtime, "sensor.connect", sensorId=sensor_id)
                await next_message(controller, message_type=MessageType.ACK)
                backend.push_chunk([[1.0]], [4000.0])
                preview = await next_message(dashboard, topic=Topic.SENSOR_PREVIEW.value)
                self.assertEqual(preview.payload["sample"]["values"], [1.0])
                self.assertEqual(count_log_topic(logger.path, LSL_RAW_TOPIC), 0)

                await runtime.handle_message(
                    MessageEnvelope(
                        type=MessageType.PUBLISH,
                        clientId="unreal-test",
                        topic=Topic.EXPERIENCE_LIFECYCLE,
                        payload={"event": "started", "runId": "run-lsl"},
                    )
                )
                await send_command(
                    runtime,
                    "sensor.session.attach",
                    sensorId=sensor_id,
                    runId="run-lsl",
                )
                await next_message(controller, message_type=MessageType.ACK)
                await next_message(dashboard, topic=Topic.SENSOR_SESSION.value)
                backend.push_chunk([[2.0]], [4001.0])
                boundary_preview = await next_message(
                    dashboard,
                    topic=Topic.SENSOR_PREVIEW.value,
                )
                self.assertEqual(boundary_preview.payload["sample"]["values"], [2.0])
                self.assertEqual(count_log_topic(logger.path, LSL_RAW_TOPIC), 0)

                backend.push_chunk([[3.0], [4.0]], [4001.1, 4001.2])
                raw = await next_message(dashboard, topic=LSL_RAW_TOPIC)
                self.assertEqual(raw.payload["runId"], "run-lsl")
                self.assertEqual(raw.payload["sampleCount"], 2)
                self.assertEqual(raw.payload["samples"][0]["values"], [3.0])
                self.assertGreater(count_log_topic(logger.path, LSL_RAW_TOPIC), 0)

                await send_command(
                    runtime,
                    "sensor.session.detach",
                    sensorId=sensor_id,
                    runId="run-lsl",
                )
                await next_message(controller, message_type=MessageType.ACK)
                await next_message(dashboard, topic=Topic.SENSOR_SESSION.value)
                raw_count = count_log_topic(logger.path, LSL_RAW_TOPIC)
                backend.push_chunk([[5.0]], [4002.0])
                await asyncio.sleep(0.05)
                self.assertEqual(count_log_topic(logger.path, LSL_RAW_TOPIC), raw_count)
                self.assertNotIn("sensor.preview", logger.path.read_text(encoding="utf-8"))
            finally:
                await manager.stop()

    async def test_status_endpoint_keeps_provider_visible_when_disabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            app = create_app(
                HubConfig(
                    log_dir=Path(tmpdir),
                    session_id="session-test",
                    cors_origins=[],
                    lsl_enabled=False,
                )
            )
            status_route = next(route for route in app.routes if getattr(route, "path", None) == "/status")

            payload = await status_route.endpoint()

            self.assertEqual(payload["sensorManager"]["providers"][0]["providerId"], "lsl")
            self.assertEqual(payload["sensorManager"]["providers"][0]["state"], "disabled")


class LslSimulatorCliTest(unittest.TestCase):
    def test_simulator_defaults_to_two_channel_ten_hertz_outlet(self) -> None:
        args = build_parser().parse_args([])

        self.assertEqual(args.name, "Biofeedback Hub Test")
        self.assertEqual(args.rate, 10.0)
        self.assertEqual(len(make_sample(0.0)), 2)


@unittest.skipUnless(
    os.getenv("BIOFEEDBACK_TEST_REAL_LSL") == "1" and importlib.util.find_spec("pylsl"),
    "real LSL smoke is opt-in and requires pylsl",
)
class PylslRuntimeSmokeTest(unittest.IsolatedAsyncioTestCase):
    async def test_real_outlet_discovery_inlet_metadata_and_chunk(self) -> None:
        import pylsl

        source_id = f"biofeedback-hub-ci-{uuid4()}"
        info = pylsl.StreamInfo(
            "Biofeedback Hub CI",
            "TestSignal",
            2,
            10.0,
            pylsl.cf_float32,
            source_id,
        )
        channels = info.desc().append_child("channels")
        for label in ("signal_a", "signal_b"):
            channel = channels.append_child("channel")
            channel.append_child_value("label", label)
            channel.append_child_value("unit", "a.u.")
            channel.append_child_value("type", "synthetic")
        outlet = pylsl.StreamOutlet(info)
        provider = LslDiscoveryProvider(discovery_timeout_seconds=0.5)

        adapter = None
        for _ in range(8):
            result = await provider.discover()
            adapter = next(
                (
                    item
                    for item in result.adapters
                    if item.status()["stream"]["sourceId"] == source_id
                ),
                None,
            )
            if adapter is not None:
                break
            await asyncio.sleep(0.1)
        self.assertIsNotNone(adapter, provider.snapshot())
        assert adapter is not None

        iterator = None
        try:
            await adapter.connect()
            iterator = adapter.samples()
            outlet.push_sample([0.25, 0.75], timestamp=pylsl.local_clock())
            sample = await asyncio.wait_for(anext(iterator), timeout=5)

            self.assertEqual(sample.topic, LSL_RAW_TOPIC)
            self.assertEqual((sample.preview_payload or {})["values"], [0.25, 0.75])
            self.assertEqual(
                [channel["label"] for channel in sample.payload["stream"]["channels"]],
                ["signal_a", "signal_b"],
            )
        finally:
            if iterator is not None:
                await iterator.aclose()
            await adapter.disconnect()
            del outlet


class FakeInfo:
    def __init__(
        self,
        *,
        name: str,
        stream_type: str,
        channel_format: str,
        source_id: str = "",
        uid: str = "",
        hostname: str = "test-host",
        channels: list[tuple[str, str, str]] | None = None,
        channel_count: int | None = None,
        nominal_srate: float = 10.0,
    ) -> None:
        self._name = name
        self._type = stream_type
        self._format = channel_format
        self._source_id = source_id
        self._uid = uid
        self._hostname = hostname
        self._channels = channels if channels is not None else [("channel-1", "a.u.", "signal")]
        self._channel_count = channel_count if channel_count is not None else len(self._channels)
        self._nominal_srate = nominal_srate

    def name(self) -> str:
        return self._name

    def type(self) -> str:
        return self._type

    def channel_format(self) -> str:
        return self._format

    def source_id(self) -> str:
        return self._source_id

    def uid(self) -> str:
        return self._uid

    def hostname(self) -> str:
        return self._hostname

    def channel_count(self) -> int:
        return self._channel_count

    def nominal_srate(self) -> float:
        return self._nominal_srate

    def desc(self) -> FakeDescriptionRoot:
        return FakeDescriptionRoot(self._channels)


class FakeDescriptionRoot:
    def __init__(self, channels: list[tuple[str, str, str]]) -> None:
        self.channels = channels

    def child(self, name: str) -> FakeChannelsNode:
        if name != "channels":
            raise KeyError(name)
        return FakeChannelsNode(self.channels)


class FakeChannelsNode:
    def __init__(self, channels: list[tuple[str, str, str]]) -> None:
        self.channels = channels

    def child(self, name: str) -> FakeChannelNode:
        if name != "channel":
            raise KeyError(name)
        return FakeChannelNode(self.channels, 0)


class FakeChannelNode:
    def __init__(self, channels: list[tuple[str, str, str]], index: int) -> None:
        self.channels = channels
        self.index = index

    def empty(self) -> bool:
        return self.index >= len(self.channels)

    def child_value(self, name: str) -> str:
        values = dict(zip(("label", "unit", "type"), self.channels[self.index], strict=True))
        return values.get(name, "")

    def next_sibling(self) -> FakeChannelNode:
        return FakeChannelNode(self.channels, self.index + 1)


class FakeBackend:
    def __init__(
        self,
        *,
        infos: list[FakeInfo] | None = None,
        time_correction: float | Exception = 0.0,
        full_info: FakeInfo | Exception | None = None,
        resolve_error: Exception | None = None,
    ) -> None:
        self.infos = infos or []
        self.correction = time_correction
        self.full_stream_info = full_info
        self.resolve_error = resolve_error
        self.chunks: list[tuple[list[Any], list[float]]] = []
        self.flush_calls = 0
        self.flushed_sample_count = 0
        self.time_correction_timeouts: list[float] = []

    def resolve_streams(self, wait_time: float) -> list[FakeInfo]:
        if self.resolve_error is not None:
            raise self.resolve_error
        return list(self.infos)

    def channel_format_name(self, info: FakeInfo) -> str:
        return info.channel_format()

    def create_inlet(self, info: FakeInfo) -> dict[str, Any]:
        return {"info": info, "open": False}

    def open_stream(self, inlet: dict[str, Any], timeout: float) -> None:
        inlet["open"] = True

    def full_info(self, inlet: dict[str, Any], timeout: float) -> FakeInfo:
        if isinstance(self.full_stream_info, Exception):
            raise self.full_stream_info
        return self.full_stream_info or inlet["info"]

    def close_stream(self, inlet: dict[str, Any]) -> None:
        inlet["open"] = False

    def pull_chunk(
        self,
        inlet: dict[str, Any],
        timeout: float,
        max_samples: int,
    ) -> tuple[list[Any], list[float]]:
        deadline = time.monotonic() + timeout
        while not self.chunks and time.monotonic() < deadline:
            time.sleep(0.001)
        if not self.chunks:
            return [], []
        samples, timestamps = self.chunks.pop(0)
        return samples[:max_samples], timestamps[:max_samples]

    def flush_samples(self, inlet: dict[str, Any]) -> int:
        self.flush_calls += 1
        flushed = sum(len(samples) for samples, _ in self.chunks)
        self.flushed_sample_count += flushed
        self.chunks.clear()
        return flushed

    def time_correction(self, inlet: dict[str, Any], timeout: float) -> float:
        self.time_correction_timeouts.append(timeout)
        if isinstance(self.correction, Exception):
            raise self.correction
        return self.correction

    def local_clock(self) -> float:
        return 5000.0

    def push_chunk(self, samples: list[Any], timestamps: list[float]) -> None:
        self.chunks.append((samples, timestamps))


class BlockingPullBackend(FakeBackend):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        from threading import Event

        self.pull_started = Event()
        self.pull_active = False
        self.close_while_pull_active = False

    def pull_chunk(
        self,
        inlet: dict[str, Any],
        timeout: float,
        max_samples: int,
    ) -> tuple[list[Any], list[float]]:
        self.pull_active = True
        self.pull_started.set()
        try:
            time.sleep(timeout)
            return [], []
        finally:
            self.pull_active = False

    def close_stream(self, inlet: dict[str, Any]) -> None:
        self.close_while_pull_active = self.pull_active
        super().close_stream(inlet)


class BlockingFlushBackend(FakeBackend):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        from threading import Event

        self.flush_started = Event()
        self.release_flush = Event()
        self.flush_active = False
        self.close_while_flush_active = False

    def flush_samples(self, inlet: dict[str, Any]) -> int:
        self.flush_active = True
        self.flush_started.set()
        try:
            self.release_flush.wait(timeout=2)
            return super().flush_samples(inlet)
        finally:
            self.flush_active = False

    def close_stream(self, inlet: dict[str, Any]) -> None:
        self.close_while_flush_active = self.flush_active
        super().close_stream(inlet)


class BlockingCorrectionBackend(FakeBackend):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        from threading import Event

        self.block_correction = False
        self.correction_started = Event()
        self.release_correction = Event()
        self.correction_active = False
        self.close_while_correction_active = False

    def time_correction(self, inlet: dict[str, Any], timeout: float) -> float:
        if not self.block_correction:
            return super().time_correction(inlet, timeout)
        self.correction_active = True
        self.correction_started.set()
        try:
            self.release_correction.wait(timeout=1)
            return super().time_correction(inlet, timeout)
        finally:
            self.correction_active = False

    def close_stream(self, inlet: dict[str, Any]) -> None:
        self.close_while_correction_active = self.correction_active
        super().close_stream(inlet)


class BlockingConnectBackend(FakeBackend):
    def __init__(self, *, stage: str, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        from threading import Event

        self.stage = stage
        self.stage_started = Event()
        self.release_stage = Event()
        self.close_count = 0

    def _wait_if_selected(self, stage: str) -> None:
        if self.stage != stage:
            return
        self.stage_started.set()
        self.release_stage.wait(timeout=1)

    def create_inlet(self, info: FakeInfo) -> dict[str, Any]:
        self._wait_if_selected("create")
        return super().create_inlet(info)

    def open_stream(self, inlet: dict[str, Any], timeout: float) -> None:
        self._wait_if_selected("open")
        super().open_stream(inlet, timeout)

    def full_info(self, inlet: dict[str, Any], timeout: float) -> FakeInfo:
        self._wait_if_selected("full_info")
        return super().full_info(inlet, timeout)

    def close_stream(self, inlet: dict[str, Any]) -> None:
        self.close_count += 1
        super().close_stream(inlet)


async def send_command(runtime: HubRuntime, action: str, **arguments: str) -> None:
    await runtime.handle_message(
        MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="dashboard-controller",
            topic=Topic.SENSOR_COMMANDS,
            requiresAck=True,
            payload={"action": action, "arguments": arguments},
        )
    )


async def next_message(
    connection: Any,
    *,
    topic: str | None = None,
    message_type: MessageType | None = None,
) -> MessageEnvelope:
    deadline = asyncio.get_running_loop().time() + 1
    while True:
        timeout = deadline - asyncio.get_running_loop().time()
        if timeout <= 0:
            raise AssertionError(f"Timed out waiting for topic={topic!r} type={message_type!r}")
        message = await asyncio.wait_for(connection.outbox.get(), timeout=timeout)
        if topic is not None and message.topic != topic:
            continue
        if message_type is not None and message.type != message_type:
            continue
        return message


def count_log_topic(path: Path, topic: str) -> int:
    return sum(
        1
        for line in path.read_text(encoding="utf-8").splitlines()
        if json.loads(line).get("topic") == topic
    )


async def wait_for_sync_status(adapter: Any, status: str) -> None:
    for _ in range(100):
        if adapter.status()["sync"]["status"] == status:
            return
        await asyncio.sleep(0.005)
    raise AssertionError(f"Timed out waiting for LSL sync status {status!r}")


if __name__ == "__main__":
    unittest.main()
