import asyncio
import json
import tempfile
import unittest
from collections.abc import Callable
from pathlib import Path

from biofeedback_hub.adapters.base import ManagedSensorAdapter, SensorSample
from biofeedback_hub.adapters.simulator_managed import SimulatedManagedHrvAdapter
from biofeedback_hub.core.broker import ClientConnection, TopicBroker
from biofeedback_hub.core.runtime import HubRuntime
from biofeedback_hub.core.sensor_manager import SensorManager
from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.schemas.envelope import ClientHello, ClientRole, MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic


class SensorManagerTest(unittest.IsolatedAsyncioTestCase):
    async def test_irregular_stream_does_not_infer_stale_from_silence(self) -> None:
        clock = FakeMonotonicClock()
        adapter = SlowRateControlledSamplesAdapter(nominal_rate_hz=0.0)
        async with sensor_manager_fixture(
            adapter=adapter,
            stale_timeout_seconds=5.0,
            monotonic_clock=clock,
        ) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()

            clock.advance(120.0)
            await fixture.manager._check_sensor_freshness()

            sensor = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(sensor["state"], "connected")
            self.assertIsNone(sensor["freshness"]["staleAfterMs"])

    async def test_slow_rate_sensor_uses_rate_aware_stale_timeout(self) -> None:
        clock = FakeMonotonicClock()
        adapter = SlowRateControlledSamplesAdapter(nominal_rate_hz=0.1)
        async with sensor_manager_fixture(
            adapter=adapter,
            stale_timeout_seconds=5.0,
            monotonic_clock=clock,
        ) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()

            clock.advance(6.0)
            await fixture.manager._check_sensor_freshness()
            sensor = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(sensor["state"], "connected")
            self.assertEqual(sensor["freshness"]["staleAfterMs"], 30000.0)

            clock.advance(24.1)
            await fixture.manager._check_sensor_freshness()
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "stale")

    async def test_armed_stale_sensor_attaches_and_recovers_in_same_run(self) -> None:
        clock = FakeMonotonicClock()
        adapter = ControlledSamplesAdapter()
        async with sensor_manager_fixture(
            adapter=adapter,
            stale_timeout_seconds=2.0,
            monotonic_clock=clock,
        ) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_sensor_command("sensor.session.arm", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()

            clock.advance(2.1)
            await fixture.manager._check_sensor_freshness()
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "stale")

            await fixture.send_lifecycle("started", runId="run-slow-start")
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["attachedRunId"]
                == "run-slow-start"
            )
            attached = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(attached["state"], "stale")
            self.assertTrue(attached["recordingGateOpen"])

            adapter.emit_sample(sequence=1)
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["state"] == "recording"
            )
            await fixture.wait_until(lambda: adapter.pull_count >= 2)
            adapter.emit_sample(sequence=2)
            raw = await fixture.next_topic(Topic.HRV_RAW.value)
            self.assertEqual(raw.payload["runId"], "run-slow-start")
            self.assertEqual(raw.payload["sequence"], 2)

    async def test_normal_sample_iterator_end_becomes_error_and_can_reconnect(self) -> None:
        adapter = FiniteOnceAdapter()
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["state"] == "error"
            )
            failed = fixture.manager.snapshot()["sensors"][0]
            self.assertIn("stream ended unexpectedly", failed["lastError"])

            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            reconnect_ack = await fixture.next_controller_ack()
            self.assertEqual(reconnect_ack.payload["status"], "accepted")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")

    async def test_connected_sensor_becomes_stale_once_and_recovers_on_sample(self) -> None:
        clock = FakeMonotonicClock()
        adapter = ControlledSamplesAdapter()
        async with sensor_manager_fixture(
            adapter=adapter,
            stale_timeout_seconds=2.0,
            monotonic_clock=clock,
        ) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()

            clock.advance(2.1)
            await fixture.manager._check_sensor_freshness()

            stale = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(stale["state"], "stale")
            self.assertEqual(stale["quality"], "stale")
            self.assertEqual(stale["freshness"]["status"], "stale")
            self.assertFalse(stale["freshness"]["hasReceivedSample"])
            self.assertEqual(fixture.log_status_event_count("stale"), 1)

            await fixture.manager._check_sensor_freshness()
            self.assertEqual(fixture.log_status_event_count("stale"), 1)

            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "stale")
            self.assertEqual(fixture.log_status_event_count("stale"), 1)

            stale_state_count = fixture.log_status_state_count("stale")
            await fixture.send_sensor_command("sensor.scan")
            await fixture.next_controller_ack()
            self.assertEqual(fixture.log_status_state_count("stale"), stale_state_count)

            adapter.emit_sample(sequence=1)
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["state"] == "connected"
            )
            await fixture.wait_until(lambda: fixture.log_status_event_count("recovered") == 1)

            recovered = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(recovered["quality"], "good")
            self.assertEqual(recovered["freshness"]["status"], "fresh")
            self.assertTrue(recovered["freshness"]["hasReceivedSample"])
            self.assertEqual(recovered["lastSampleAt"], "2026-08-06T10:00:01Z")
            self.assertEqual(fixture.log_status_event_count("recovered"), 1)

            adapter.emit_sample(sequence=2)
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["lastSampleAt"]
                == "2026-08-06T10:00:02Z"
            )
            self.assertEqual(fixture.log_status_event_count("recovered"), 1)

    async def test_recording_sensor_keeps_gate_while_stale_and_resumes_raw_samples(self) -> None:
        clock = FakeMonotonicClock()
        adapter = ControlledSamplesAdapter()
        async with sensor_manager_fixture(
            adapter=adapter,
            stale_timeout_seconds=2.0,
            monotonic_clock=clock,
        ) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-stale")
            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-stale",
            )
            await fixture.next_controller_ack()

            clock.advance(2.1)
            await fixture.manager._check_sensor_freshness()

            stale = fixture.manager.snapshot()
            sensor = stale["sensors"][0]
            self.assertEqual(sensor["state"], "stale")
            self.assertEqual(sensor["attachedRunId"], "run-stale")
            self.assertTrue(sensor["recordingGateOpen"])
            self.assertEqual(stale["recordingCount"], 1)
            self.assertTrue(fixture.latest_status_event_payload("stale")["recordingGateOpen"])

            adapter.emit_sample(sequence=1)
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["state"] == "recording"
            )
            await fixture.wait_until(lambda: adapter.pull_count >= 2)
            adapter.emit_sample(sequence=2)
            raw = await fixture.next_topic(Topic.HRV_RAW.value)

            recovered = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(raw.payload["runId"], "run-stale")
            self.assertEqual(raw.payload["sequence"], 2)
            self.assertEqual(recovered["attachedRunId"], "run-stale")
            self.assertTrue(recovered["recordingGateOpen"])
            self.assertEqual(fixture.log_status_event_count("recovered"), 1)

    async def test_retry_attach_for_stale_recording_is_idempotent(self) -> None:
        clock = FakeMonotonicClock()
        adapter = ControlledSamplesAdapter()
        async with sensor_manager_fixture(
            adapter=adapter,
            stale_timeout_seconds=2.0,
            monotonic_clock=clock,
        ) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-stale-retry")
            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-stale-retry",
            )
            await fixture.next_controller_ack()
            clock.advance(2.1)
            await fixture.manager._check_sensor_freshness()

            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-stale-retry",
            )
            retry_ack = await fixture.next_controller_ack()
            sensor = fixture.manager.snapshot()["sensors"][0]

            self.assertEqual(retry_ack.payload["status"], "accepted")
            self.assertEqual(adapter.start_calls, ["run-stale-retry"])
            self.assertEqual(fixture.log_topic_count(Topic.SENSOR_SESSION.value), 1)
            self.assertEqual(sensor["state"], "stale")
            self.assertTrue(sensor["recordingGateOpen"])

    async def test_stale_recording_can_detach_and_disconnect_safely(self) -> None:
        clock = FakeMonotonicClock()
        adapter = ControlledSamplesAdapter()
        async with sensor_manager_fixture(
            adapter=adapter,
            stale_timeout_seconds=2.0,
            monotonic_clock=clock,
        ) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-detach")
            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-detach",
            )
            await fixture.next_controller_ack()

            clock.advance(2.1)
            await fixture.manager._check_sensor_freshness()
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "stale")

            await fixture.send_sensor_command(
                "sensor.session.detach",
                sensorId="sim-hrv-1",
                runId="run-detach",
            )
            detach_ack = await fixture.next_controller_ack()
            detached = fixture.manager.snapshot()["sensors"][0]

            self.assertEqual(detach_ack.payload["status"], "accepted")
            self.assertEqual(detached["state"], "stale")
            self.assertIsNone(detached["attachedRunId"])
            self.assertFalse(detached["recordingGateOpen"])

            await fixture.send_sensor_command("sensor.disconnect", sensorId="sim-hrv-1")
            disconnect_ack = await fixture.next_controller_ack()
            disconnected = fixture.manager.snapshot()["sensors"][0]

            self.assertEqual(disconnect_ack.payload["status"], "accepted")
            self.assertEqual(disconnected["state"], "disconnected")
            self.assertEqual(disconnected["freshness"]["status"], "unknown")

    async def test_connect_failure_sets_error_and_allows_retry(self) -> None:
        adapter = FailOnceConnectAdapter(interval_seconds=0.01)
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            failed_ack = await fixture.next_controller_ack()

            failed = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(failed_ack.payload["status"], "failed")
            self.assertEqual(failed["state"], "error")
            self.assertIn("simulated connect failure", failed["lastError"])
            self.assertFalse(failed["adapterStatus"]["connected"])

            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            retry_ack = await fixture.next_controller_ack()

            self.assertEqual(retry_ack.payload["status"], "accepted")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")

    async def test_disconnect_failure_keeps_sensor_retryable(self) -> None:
        adapter = FailOnceDisconnectAdapter(interval_seconds=0.01)
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()

            await fixture.send_sensor_command("sensor.disconnect", sensorId="sim-hrv-1")
            failed_ack = await fixture.next_controller_ack()
            failed = fixture.manager.snapshot()["sensors"][0]

            self.assertEqual(failed_ack.payload["status"], "failed")
            self.assertEqual(failed["state"], "error")
            self.assertIsNone(failed["attachedRunId"])
            self.assertFalse(failed["recordingGateOpen"])
            self.assertEqual(
                sum(1 for task in fixture.manager._consumer_tasks.values() if not task.done()),
                0,
            )

            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            retry_ack = await fixture.next_controller_ack()
            await fixture.wait_until(
                lambda: (
                    (task := fixture.manager._consumer_tasks.get("sim-hrv-1")) is not None
                    and not task.done()
                )
            )

            self.assertEqual(retry_ack.payload["status"], "accepted")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")

    async def test_consumer_failure_closes_adapter_and_allows_retry(self) -> None:
        adapter = FailOnceSamplesAdapter(interval_seconds=0.01)
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["state"] == "error"
            )

            failed = fixture.manager.snapshot()["sensors"][0]
            self.assertIn("simulated sample failure", failed["lastError"])
            self.assertFalse(failed["adapterStatus"]["connected"])

            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            retry_ack = await fixture.next_controller_ack()

            self.assertEqual(retry_ack.payload["status"], "accepted")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")

    async def test_reconnect_waits_for_failed_consumer_cleanup(self) -> None:
        adapter = BlockingFailureCleanupAdapter(interval_seconds=0.01)
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await asyncio.wait_for(adapter.disconnect_entered.wait(), timeout=1)
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["state"] == "error"
            )

            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await asyncio.sleep(0.05)

            self.assertEqual(adapter.connect_calls, 1)
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "error")

            adapter.release_disconnect.set()
            retry_ack = await fixture.next_controller_ack()
            await fixture.wait_until(
                lambda: (
                    (task := fixture.manager._consumer_tasks.get("sim-hrv-1")) is not None
                    and not task.done()
                )
            )

            self.assertEqual(retry_ack.payload["status"], "accepted")
            self.assertEqual(adapter.connect_calls, 2)
            self.assertTrue(adapter.status()["connected"])
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")

    async def test_cancelled_stop_finishes_adapter_and_broker_cleanup(self) -> None:
        adapter = BlockingFailureCleanupAdapter(interval_seconds=0.01)
        fixture_context = sensor_manager_fixture(adapter=adapter)
        fixture = await fixture_context.__aenter__()
        try:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await asyncio.wait_for(adapter.disconnect_entered.wait(), timeout=1)

            stop_task = asyncio.create_task(fixture.manager.stop())
            await asyncio.sleep(0)
            stop_task.cancel()
            await asyncio.sleep(0)
            self.assertFalse(stop_task.done())

            adapter.release_disconnect.set()
            with self.assertRaises(asyncio.CancelledError):
                await stop_task
            self.assertFalse(fixture.manager._started)
            self.assertIsNone(fixture.broker.get_client("sensor-manager"))
            self.assertFalse(adapter.status()["connected"])
        finally:
            adapter.release_disconnect.set()
            if fixture.manager._started:
                await fixture.manager.stop()
            fixture_context._tmpdir.cleanup()

    async def test_sensor_command_ack_and_state_transitions(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.scan")
            ack = await fixture.next_controller_ack()

            self.assertEqual(ack.payload["status"], "accepted")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "available")

            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()

            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")
            preview = await fixture.next_topic(Topic.SENSOR_PREVIEW.value)
            self.assertEqual(preview.payload["sensorId"], "sim-hrv-1")
            self.assertEqual(preview.payload["sample"]["source"], "simulator")

    async def test_rejects_invalid_attach_with_ack_detail(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.session.attach", sensorId="sim-hrv-1")
            ack = await fixture.next_controller_ack()

            self.assertEqual(ack.payload["status"], "rejected")
            self.assertIn("runId", ack.payload["detail"])
            await fixture.wait_until(lambda: fixture.log_type_count("ack") == 1)
            self.assertEqual(fixture.log_type_count("ack"), 1)

    async def test_rejects_detach_without_prior_attach(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()

            await fixture.send_sensor_command("sensor.session.detach", sensorId="sim-hrv-1", runId="run-001")
            ack = await fixture.next_controller_ack()

            self.assertEqual(ack.payload["status"], "rejected")
            self.assertIn("not attached", ack.payload["detail"])
            self.assertEqual(fixture.log_topic_count(Topic.SENSOR_SESSION.value), 0)

    async def test_rejects_attach_to_new_run_while_recording(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-001")
            await fixture.send_sensor_command("sensor.session.attach", sensorId="sim-hrv-1", runId="run-001")
            await fixture.next_controller_ack()

            await fixture.send_sensor_command("sensor.session.attach", sensorId="sim-hrv-1", runId="run-002")
            ack = await fixture.next_controller_ack()

            self.assertEqual(ack.payload["status"], "rejected")
            self.assertIn("another run", ack.payload["detail"])
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["attachedRunId"], "run-001")
            self.assertEqual(fixture.log_topic_count(Topic.SENSOR_SESSION.value), 1)

    async def test_rejects_disconnect_while_recording(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-001")
            await fixture.send_sensor_command("sensor.session.attach", sensorId="sim-hrv-1", runId="run-001")
            await fixture.next_controller_ack()

            await fixture.send_sensor_command("sensor.disconnect", sensorId="sim-hrv-1")
            ack = await fixture.next_controller_ack()

            self.assertEqual(ack.payload["status"], "rejected")
            self.assertIn("detach before disconnect", ack.payload["detail"])
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "recording")

    async def test_rejects_disarm_while_recording(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-001")
            await fixture.send_sensor_command("sensor.session.attach", sensorId="sim-hrv-1", runId="run-001")
            await fixture.next_controller_ack()

            await fixture.send_sensor_command("sensor.session.disarm", sensorId="sim-hrv-1")
            ack = await fixture.next_controller_ack()

            self.assertEqual(ack.payload["status"], "rejected")
            self.assertIn("detach from its run", ack.payload["detail"])
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "recording")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["attachedRunId"], "run-001")

    async def test_arm_and_disarm_before_experience(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_PREVIEW.value)

            await fixture.send_sensor_command("sensor.session.arm", sensorId="sim-hrv-1")
            arm_ack = await fixture.next_controller_ack()

            self.assertEqual(arm_ack.payload["status"], "accepted")
            self.assertEqual(fixture.manager.snapshot()["armedCount"], 1)
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")
            self.assertTrue(fixture.manager.snapshot()["sensors"][0]["armedForNextRun"])
            self.assertEqual(fixture.log_topic_count(Topic.HRV_RAW.value), 0)

            await fixture.send_sensor_command("sensor.session.disarm", sensorId="sim-hrv-1")
            disarm_ack = await fixture.next_controller_ack()

            self.assertEqual(disarm_ack.payload["status"], "accepted")
            self.assertEqual(fixture.manager.snapshot()["armedCount"], 0)
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")
            self.assertFalse(fixture.manager.snapshot()["sensors"][0]["armedForNextRun"])

    async def test_armed_sensor_records_only_inside_lifecycle_run(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_PREVIEW.value)
            await fixture.send_sensor_command("sensor.session.arm", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()

            await asyncio.sleep(0.05)
            self.assertEqual(fixture.log_topic_count(Topic.HRV_RAW.value), 0)

            await fixture.send_lifecycle("started", runId="run-xr-001")
            attached = await fixture.next_topic(Topic.SENSOR_SESSION.value)
            raw = await fixture.next_topic(Topic.HRV_RAW.value)

            self.assertEqual(attached.payload["event"], "attached")
            self.assertEqual(attached.payload["runId"], "run-xr-001")
            self.assertEqual(raw.payload["runId"], "run-xr-001")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "recording")
            self.assertEqual(fixture.manager.snapshot()["activeRunId"], "run-xr-001")

            await fixture.send_lifecycle("ended", runId="run-xr-001")
            detached = await fixture.next_topic(Topic.SENSOR_SESSION.value)

            self.assertEqual(detached.payload["event"], "detached")
            self.assertEqual(detached.payload["runId"], "run-xr-001")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")
            await fixture.wait_until(lambda: fixture.manager.snapshot()["activeRunId"] is None)
            self.assertIsNone(fixture.manager.snapshot()["activeRunId"])

            raw_count_after_end = fixture.log_topic_count(Topic.HRV_RAW.value)
            await asyncio.sleep(0.08)
            self.assertEqual(fixture.log_topic_count(Topic.HRV_RAW.value), raw_count_after_end)

    async def test_preview_is_not_logged_but_status_and_session_are_logged(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_PREVIEW.value)

            log_text = fixture.log_path.read_text(encoding="utf-8")
            self.assertIn("sensor.status", log_text)
            self.assertNotIn("sensor.preview", log_text)

            await fixture.send_lifecycle("started", runId="run-001")
            await fixture.send_sensor_command("sensor.session.attach", sensorId="sim-hrv-1", runId="run-001")
            await fixture.next_controller_ack()
            session = await fixture.next_topic(Topic.SENSOR_SESSION.value)

            self.assertEqual(session.payload["event"], "attached")
            self.assertIn("sensor.session", fixture.log_path.read_text(encoding="utf-8"))

    async def test_raw_samples_start_after_attach_and_stop_after_detach(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_PREVIEW.value)
            self.assertEqual(fixture.log_topic_count(Topic.HRV_RAW.value), 0)

            await fixture.send_lifecycle("started", runId="run-001")
            await fixture.send_sensor_command("sensor.session.attach", sensorId="sim-hrv-1", runId="run-001")
            await fixture.next_controller_ack()
            raw = await fixture.next_topic(Topic.HRV_RAW.value)

            self.assertEqual(raw.payload["sensorId"], "sim-hrv-1")
            self.assertEqual(raw.payload["runId"], "run-001")
            self.assertGreater(fixture.log_topic_count(Topic.HRV_RAW.value), 0)

            await fixture.send_sensor_command("sensor.session.detach", sensorId="sim-hrv-1", runId="run-001")
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_SESSION.value)

            raw_count_after_detach = fixture.log_topic_count(Topic.HRV_RAW.value)
            await asyncio.sleep(0.08)
            self.assertEqual(fixture.log_topic_count(Topic.HRV_RAW.value), raw_count_after_detach)
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")

    async def test_sample_wait_started_before_attach_is_preview_only(self) -> None:
        adapter = ControlledSamplesAdapter()
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.wait_until(lambda: adapter.pull_count >= 1)

            await fixture.send_lifecycle("started", runId="run-boundary")
            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-boundary",
            )
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_SESSION.value)

            adapter.emit_sample(sequence=1)
            preview = await fixture.next_topic(Topic.SENSOR_PREVIEW.value)
            self.assertEqual(preview.payload["sample"]["sequence"], 1)
            await fixture.wait_until(lambda: adapter.pull_count >= 2)
            await asyncio.sleep(0.02)
            self.assertEqual(fixture.log_topic_count(Topic.HRV_RAW.value), 0)

            adapter.emit_sample(sequence=2)
            raw = await fixture.next_topic(Topic.HRV_RAW.value)
            self.assertEqual(raw.payload["sequence"], 2)
            self.assertEqual(raw.payload["runId"], "run-boundary")

    async def test_sample_wait_completed_after_detach_remains_preview_only(self) -> None:
        adapter = ControlledSamplesAdapter()
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.wait_until(lambda: adapter.pull_count >= 1)
            adapter.emit_sample(sequence=1)
            await fixture.next_topic(Topic.SENSOR_PREVIEW.value)
            await fixture.wait_until(lambda: adapter.pull_count >= 2)

            await fixture.send_lifecycle("started", runId="run-detach-boundary")
            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-detach-boundary",
            )
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_SESSION.value)

            adapter.emit_sample(sequence=2)
            await fixture.wait_until(lambda: adapter.pull_count >= 3)
            await asyncio.sleep(0.02)
            self.assertEqual(fixture.log_topic_count(Topic.HRV_RAW.value), 0)

            adapter.emit_sample(sequence=3)
            raw = await fixture.next_topic(Topic.HRV_RAW.value)
            self.assertEqual(raw.payload["sequence"], 3)
            await fixture.wait_until(lambda: adapter.pull_count >= 4)

            await fixture.send_sensor_command(
                "sensor.session.detach",
                sensorId="sim-hrv-1",
                runId="run-detach-boundary",
            )
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_SESSION.value)
            raw_count = fixture.log_topic_count(Topic.HRV_RAW.value)

            await asyncio.sleep(0.02)
            adapter.emit_sample(sequence=4)
            while True:
                preview = await fixture.next_topic(Topic.SENSOR_PREVIEW.value)
                if preview.payload["sample"]["sequence"] == 4:
                    break
            await asyncio.sleep(0.02)
            self.assertEqual(fixture.log_topic_count(Topic.HRV_RAW.value), raw_count)

    async def test_detach_reports_disconnected_when_adapter_closed_during_stop(self) -> None:
        adapter = DisconnectOnStopAdapter(interval_seconds=0.01)
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-disconnect")
            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-disconnect",
            )
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_SESSION.value)

            await fixture.send_sensor_command(
                "sensor.session.detach",
                sensorId="sim-hrv-1",
                runId="run-disconnect",
            )
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_SESSION.value)
            status = await fixture.next_topic(Topic.SENSOR_STATUS.value)

            self.assertEqual(status.payload["event"], "disconnected")
            self.assertEqual(status.payload["state"], "disconnected")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "disconnected")

    async def test_failed_lifecycle_detach_can_be_retried_by_attached_run_id(self) -> None:
        adapter = FailOnceStopAdapter(interval_seconds=0.01)
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-retry")
            await fixture.send_sensor_command("sensor.session.attach", sensorId="sim-hrv-1", runId="run-retry")
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_SESSION.value)

            await fixture.send_lifecycle("ended", runId="run-retry")
            await fixture.wait_until(lambda: fixture.manager.snapshot()["sensors"][0]["state"] == "error")

            failed = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(failed["attachedRunId"], "run-retry")
            await fixture.wait_until(lambda: fixture.manager.snapshot()["activeRunId"] is None)
            self.assertIsNone(fixture.manager.snapshot()["activeRunId"])

            await fixture.send_sensor_command("sensor.session.detach", sensorId="sim-hrv-1", runId="run-retry")
            retry_ack = await fixture.next_controller_ack()
            detached = await fixture.next_topic(Topic.SENSOR_SESSION.value)

            self.assertEqual(retry_ack.payload["status"], "accepted")
            self.assertEqual(detached.payload["event"], "detached")
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")
            self.assertIsNone(fixture.manager.snapshot()["sensors"][0]["attachedRunId"])
            await fixture.wait_until(
                lambda: (
                    (task := fixture.manager._consumer_tasks.get("sim-hrv-1")) is not None
                    and not task.done()
                    and sum(1 for item in fixture.manager._consumer_tasks.values() if not item.done()) == 1
                )
            )

            await fixture.send_sensor_command("sensor.session.arm", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-after-recovery")
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["attachedRunId"] == "run-after-recovery"
            )
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "recording")
            self.assertEqual(
                sum(1 for item in fixture.manager._consumer_tasks.values() if not item.done()),
                1,
            )

    async def test_runtime_drops_late_sensor_sample_after_lifecycle_end(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-ended")
            await fixture.send_sensor_command("sensor.session.attach", sensorId="sim-hrv-1", runId="run-ended")
            await fixture.next_controller_ack()
            await fixture.next_topic(Topic.SENSOR_SESSION.value)
            await fixture.next_topic(Topic.HRV_RAW.value)

            await fixture.send_lifecycle("ended", runId="run-ended")
            detached = await fixture.next_topic(Topic.SENSOR_SESSION.value)
            self.assertEqual(detached.payload["event"], "detached")
            raw_count = fixture.log_topic_count(Topic.HRV_RAW.value)

            delivered = await fixture.runtime.handle_message(
                MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId="sensor-manager",
                    topic=Topic.HRV_RAW,
                    payload={"sensorId": "sim-hrv-1", "runId": "run-ended", "bpm": 75},
                )
            )

            self.assertEqual(delivered, [])
            self.assertEqual(fixture.log_topic_count(Topic.HRV_RAW.value), raw_count)

    async def test_rejects_attach_without_matching_active_lifecycle(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()

            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-without-lifecycle",
            )
            no_lifecycle_ack = await fixture.next_controller_ack()
            self.assertEqual(no_lifecycle_ack.payload["status"], "rejected")
            self.assertIn("active experience lifecycle", no_lifecycle_ack.payload["detail"])

            await fixture.send_lifecycle("started", runId="run-active")
            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-other",
            )
            wrong_run_ack = await fixture.next_controller_ack()
            self.assertEqual(wrong_run_ack.payload["status"], "rejected")
            self.assertIn("active experience run is run-active", wrong_run_ack.payload["detail"])
            self.assertEqual(fixture.manager.snapshot()["sensors"][0]["state"], "connected")

    async def test_attach_rolls_back_if_lifecycle_changes_during_adapter_start(self) -> None:
        adapter = BlockingStartAdapter()
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-A")

            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-A",
            )
            await asyncio.wait_for(adapter.start_entered.wait(), timeout=1)

            await fixture.send_lifecycle("ended", runId="run-A")
            await fixture.send_lifecycle("started", runId="run-B")
            adapter.release_start.set()

            ack = await fixture.next_controller_ack()
            self.assertEqual(ack.payload["status"], "rejected")
            self.assertIn("active experience run changed to run-B", ack.payload["detail"])
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["activeRunId"] == "run-B"
            )

            sensor = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(sensor["state"], "connected")
            self.assertFalse(sensor["armedForNextRun"])
            self.assertIsNone(sensor["attachedRunId"])
            self.assertIsNone(sensor["adapterStatus"]["recordingRunId"])
            self.assertEqual(adapter.stop_calls, ["run-A"])
            self.assertEqual(fixture.log_topic_count(Topic.SENSOR_SESSION.value), 0)

    async def test_attach_rejects_consumer_failure_during_adapter_start(self) -> None:
        adapter = BlockingStartFailingSamplesAdapter()
        async with sensor_manager_fixture(adapter=adapter) as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-consumer-race")

            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-consumer-race",
            )
            await asyncio.wait_for(adapter.start_entered.wait(), timeout=1)

            adapter.fail_samples.set()
            await fixture.wait_until(
                lambda: fixture.manager.snapshot()["sensors"][0]["state"] == "error"
            )
            adapter.release_start.set()

            ack = await fixture.next_controller_ack()
            self.assertEqual(ack.payload["status"], "rejected")
            self.assertIn("connection changed during adapter startup", ack.payload["detail"])

            sensor = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(sensor["state"], "error")
            self.assertFalse(sensor["recordingGateOpen"])
            self.assertIsNone(sensor["attachedRunId"])
            self.assertFalse(sensor["adapterStatus"]["connected"])
            self.assertIsNone(sensor["adapterStatus"]["recordingRunId"])
            self.assertEqual(adapter.stop_calls, ["run-consumer-race"])
            self.assertEqual(fixture.log_topic_count(Topic.SENSOR_SESSION.value), 0)

    async def test_attach_rolls_back_when_status_publication_fails(self) -> None:
        async with sensor_manager_fixture() as fixture:
            await fixture.send_sensor_command("sensor.connect", sensorId="sim-hrv-1")
            await fixture.next_controller_ack()
            await fixture.send_lifecycle("started", runId="run-status-failure")

            original_publish_status = fixture.manager._publish_status

            async def fail_attached_status(record, event):
                if event == "attached":
                    raise RuntimeError("simulated status publication failure")
                await original_publish_status(record, event)

            fixture.manager._publish_status = fail_attached_status  # type: ignore[method-assign]
            await fixture.send_sensor_command(
                "sensor.session.attach",
                sensorId="sim-hrv-1",
                runId="run-status-failure",
            )
            ack = await fixture.next_controller_ack()
            attached = await fixture.next_topic(Topic.SENSOR_SESSION.value)
            detached = await fixture.next_topic(Topic.SENSOR_SESSION.value)

            self.assertEqual(ack.payload["status"], "failed")
            self.assertEqual(attached.payload["event"], "attached")
            self.assertEqual(detached.payload["event"], "detached")
            sensor = fixture.manager.snapshot()["sensors"][0]
            self.assertEqual(sensor["state"], "connected")
            self.assertIsNone(sensor["attachedRunId"])
            self.assertFalse(sensor["recordingGateOpen"])
            self.assertIsNone(sensor["adapterStatus"]["recordingRunId"])
            await fixture.next_topic(Topic.SENSOR_PREVIEW.value)


class FailOnceStopAdapter(SimulatedManagedHrvAdapter):
    def __init__(self, interval_seconds: float = 1.0) -> None:
        super().__init__(interval_seconds=interval_seconds)
        self._remaining_stop_failures = 1

    async def stop_recording(self, run_id: str) -> None:
        if self._remaining_stop_failures:
            self._remaining_stop_failures -= 1
            raise RuntimeError("simulated stop failure")
        await super().stop_recording(run_id)


class FailOnceConnectAdapter(SimulatedManagedHrvAdapter):
    def __init__(self, interval_seconds: float = 1.0) -> None:
        super().__init__(interval_seconds=interval_seconds)
        self._remaining_connect_failures = 1

    async def connect(self) -> None:
        if self._remaining_connect_failures:
            self._remaining_connect_failures -= 1
            raise RuntimeError("simulated connect failure")
        await super().connect()


class FailOnceDisconnectAdapter(SimulatedManagedHrvAdapter):
    def __init__(self, interval_seconds: float = 1.0) -> None:
        super().__init__(interval_seconds=interval_seconds)
        self._remaining_disconnect_failures = 1

    async def disconnect(self) -> None:
        if self._remaining_disconnect_failures:
            self._remaining_disconnect_failures -= 1
            raise RuntimeError("simulated disconnect failure")
        await super().disconnect()


class DisconnectOnStopAdapter(SimulatedManagedHrvAdapter):
    async def stop_recording(self, run_id: str) -> None:
        await super().stop_recording(run_id)
        await self.disconnect()


class FailOnceSamplesAdapter(SimulatedManagedHrvAdapter):
    def __init__(self, interval_seconds: float = 1.0) -> None:
        super().__init__(interval_seconds=interval_seconds)
        self._remaining_sample_failures = 1

    async def samples(self):
        if self._remaining_sample_failures:
            self._remaining_sample_failures -= 1
            await asyncio.sleep(0)
            raise RuntimeError("simulated sample failure")
        async for sample in super().samples():
            yield sample


class BlockingFailureCleanupAdapter(FailOnceSamplesAdapter):
    def __init__(self, interval_seconds: float = 1.0) -> None:
        super().__init__(interval_seconds=interval_seconds)
        self.connect_calls = 0
        self.disconnect_entered = asyncio.Event()
        self.release_disconnect = asyncio.Event()

    async def connect(self) -> None:
        self.connect_calls += 1
        await super().connect()

    async def disconnect(self) -> None:
        self.disconnect_entered.set()
        await self.release_disconnect.wait()
        await super().disconnect()


class BlockingStartAdapter(SimulatedManagedHrvAdapter):
    def __init__(self) -> None:
        super().__init__(interval_seconds=0.01)
        self.start_entered = asyncio.Event()
        self.release_start = asyncio.Event()
        self.stop_calls: list[str] = []

    async def start_recording(self, run_id: str) -> None:
        self.start_entered.set()
        await self.release_start.wait()
        await super().start_recording(run_id)

    async def stop_recording(self, run_id: str) -> None:
        self.stop_calls.append(run_id)
        await super().stop_recording(run_id)


class BlockingStartFailingSamplesAdapter(BlockingStartAdapter):
    def __init__(self) -> None:
        super().__init__()
        self.fail_samples = asyncio.Event()

    async def samples(self):
        await self.fail_samples.wait()
        raise RuntimeError("simulated consumer failure during attach")
        yield self._next_sample()  # pragma: no cover


class ControlledSamplesAdapter(SimulatedManagedHrvAdapter):
    def __init__(self) -> None:
        super().__init__(interval_seconds=60)
        self._sample_queue: asyncio.Queue[SensorSample] = asyncio.Queue()
        self.start_calls: list[str] = []
        self.pull_count = 0

    async def start_recording(self, run_id: str) -> None:
        self.start_calls.append(run_id)
        await super().start_recording(run_id)

    async def samples(self):
        while self._connected:
            self.pull_count += 1
            sample = await self._sample_queue.get()
            if self._connected:
                yield sample

    def emit_sample(self, *, sequence: int) -> None:
        self._sample_queue.put_nowait(
            SensorSample(
                topic=Topic.HRV_RAW.value,
                payload={
                    "bpm": 72,
                    "rrMs": 833.33,
                    "quality": "good",
                    "sequence": sequence,
                    "source": self.source,
                },
                collected_at=f"2026-08-06T10:00:{sequence:02d}Z",
                session_time_ms=sequence * 1000,
            )
        )


class SlowRateControlledSamplesAdapter(ControlledSamplesAdapter):
    def __init__(self, *, nominal_rate_hz: float) -> None:
        super().__init__()
        self.nominal_rate_hz = nominal_rate_hz

    def status(self) -> dict[str, object]:
        return super().status() | {
            "stream": {"nominalSrateHz": self.nominal_rate_hz},
        }


class FiniteOnceAdapter(ControlledSamplesAdapter):
    def __init__(self) -> None:
        super().__init__()
        self.sample_iterations = 0

    async def samples(self):
        self.sample_iterations += 1
        if self.sample_iterations == 1:
            yield SensorSample(
                topic=Topic.HRV_RAW.value,
                payload={"bpm": 72, "sequence": 1, "source": self.source},
                collected_at="2026-08-06T10:00:01Z",
            )
            return
        async for sample in super().samples():
            yield sample


class FakeMonotonicClock:
    def __init__(self) -> None:
        self.value = 100.0

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


class SensorManagerFixture:
    def __init__(
        self,
        tmpdir: str,
        adapter: ManagedSensorAdapter | None = None,
        *,
        stale_timeout_seconds: float = 5.0,
        monotonic_clock: Callable[[], float] | None = None,
    ) -> None:
        self.broker = TopicBroker()
        self.logger = JsonlSessionLogger(Path(tmpdir), "session-test")
        self.runtime = HubRuntime(broker=self.broker, session_logger=self.logger)
        self.manager = SensorManager(
            broker=self.broker,
            runtime=self.runtime,
            adapters=[adapter or SimulatedManagedHrvAdapter(interval_seconds=0.01)],
            preview_interval_seconds=0.01,
            stale_timeout_seconds=stale_timeout_seconds,
            **({"monotonic_clock": monotonic_clock} if monotonic_clock is not None else {}),
        )
        self.controller: ClientConnection | None = None
        self.dashboard: ClientConnection | None = None

    @property
    def log_path(self) -> Path:
        return self.logger.path

    async def start(self) -> None:
        self.controller = await self.broker.connect(ClientHello(clientId="dashboard-controller", role=ClientRole.CONTROLLER))
        self.dashboard = await self.broker.connect(ClientHello(clientId="dashboard-ui", role=ClientRole.DASHBOARD))
        await self.broker.subscribe(
            "dashboard-ui",
            {Topic.SENSOR_STATUS.value, Topic.SENSOR_PREVIEW.value, Topic.SENSOR_SESSION.value, Topic.HRV_RAW.value},
        )
        await self.manager.start()

    async def stop(self) -> None:
        await self.manager.stop()

    async def send_sensor_command(self, action: str, **arguments: str) -> MessageEnvelope:
        command = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="dashboard-controller",
            topic=Topic.SENSOR_COMMANDS,
            requiresAck=True,
            payload={
                "action": action,
                "target": "single",
                "arguments": arguments,
            },
        )
        await self.runtime.handle_message(command)
        return command

    async def send_lifecycle(self, event: str, **payload: str) -> MessageEnvelope:
        lifecycle = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="unreal-test",
            topic=Topic.EXPERIENCE_LIFECYCLE,
            payload={"event": event, **payload},
        )
        await self.runtime.handle_message(lifecycle)
        return lifecycle

    async def next_controller_ack(self) -> MessageEnvelope:
        assert self.controller is not None
        return await self._next_from(self.controller, topic=None, message_type=MessageType.ACK)

    async def next_topic(self, topic: str) -> MessageEnvelope:
        assert self.dashboard is not None
        return await self._next_from(self.dashboard, topic=topic)

    async def _next_from(
        self,
        connection: ClientConnection,
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

    async def wait_until(self, condition: Callable[[], bool]) -> None:
        deadline = asyncio.get_running_loop().time() + 1
        while not condition():
            if asyncio.get_running_loop().time() >= deadline:
                raise AssertionError("Timed out waiting for sensor state")
            await asyncio.sleep(0.01)

    def log_contains(self, text: str) -> bool:
        return text in self.log_path.read_text(encoding="utf-8")

    def log_topic_count(self, topic: str) -> int:
        lines = self.log_path.read_text(encoding="utf-8").splitlines()
        return sum(1 for line in lines if json.loads(line).get("topic") == topic)

    def log_type_count(self, message_type: str) -> int:
        lines = self.log_path.read_text(encoding="utf-8").splitlines()
        return sum(1 for line in lines if json.loads(line).get("type") == message_type)

    def log_status_event_count(self, event: str) -> int:
        lines = self.log_path.read_text(encoding="utf-8").splitlines()
        return sum(
            1
            for line in lines
            if (message := json.loads(line)).get("topic") == Topic.SENSOR_STATUS.value
            and message.get("payload", {}).get("event") == event
        )

    def log_status_state_count(self, state: str) -> int:
        lines = self.log_path.read_text(encoding="utf-8").splitlines()
        return sum(
            1
            for line in lines
            if (message := json.loads(line)).get("topic") == Topic.SENSOR_STATUS.value
            and message.get("payload", {}).get("state") == state
        )

    def latest_status_event_payload(self, event: str) -> dict[str, object]:
        lines = self.log_path.read_text(encoding="utf-8").splitlines()
        for line in reversed(lines):
            message = json.loads(line)
            if (
                message.get("topic") == Topic.SENSOR_STATUS.value
                and message.get("payload", {}).get("event") == event
            ):
                return message["payload"]
        raise AssertionError(f"sensor.status event not found: {event}")


class sensor_manager_fixture:
    def __init__(
        self,
        adapter: ManagedSensorAdapter | None = None,
        *,
        stale_timeout_seconds: float = 5.0,
        monotonic_clock: Callable[[], float] | None = None,
    ) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.fixture = SensorManagerFixture(
            self._tmpdir.name,
            adapter=adapter,
            stale_timeout_seconds=stale_timeout_seconds,
            monotonic_clock=monotonic_clock,
        )

    async def __aenter__(self) -> SensorManagerFixture:
        await self.fixture.start()
        return self.fixture

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        await self.fixture.stop()
        self._tmpdir.cleanup()


if __name__ == "__main__":
    unittest.main()
