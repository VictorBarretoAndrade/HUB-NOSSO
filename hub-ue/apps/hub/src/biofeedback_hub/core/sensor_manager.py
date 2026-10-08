from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
import time
from typing import Any

from biofeedback_hub.adapters.base import (
    ManagedSensorAdapter,
    SensorDiscoveryProvider,
    SensorSample,
)
from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.core.broker import TopicBroker
from biofeedback_hub.core.runtime import HubRuntime
from biofeedback_hub.schemas.envelope import AckPayload, ClientHello, ClientRole, MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic


SENSOR_MANAGER_CLIENT_ID = "sensor-manager"
SENSOR_STATES = {
    "configured",
    "available",
    "connecting",
    "connected",
    "recording",
    "stale",
    "error",
    "disconnected",
}


@dataclass
class ManagedSensorRecord:
    adapter: ManagedSensorAdapter
    provider_id: str | None = None
    state: str = "configured"
    armed_for_next_run: bool = False
    attached_run_id: str | None = None
    accepting_recording_samples: bool = False
    recording_generation: int = 0
    connection_generation: int = 0
    last_sample_at: str | None = None
    last_status_at: str | None = None
    last_error: str | None = None
    last_preview_monotonic: float | None = None
    freshness_started_monotonic: float | None = None
    last_sample_monotonic: float | None = None
    stale_since_monotonic: float | None = None
    recording_lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def snapshot(self) -> dict[str, Any]:
        status = self.adapter.status()
        return {
            "sensorId": self.adapter.sensor_id,
            "adapterId": self.adapter.adapter_id,
            "providerId": self.provider_id,
            "source": self.adapter.source,
            "displayName": self.adapter.display_name,
            "deviceType": self.adapter.device_type,
            "topics": list(self.adapter.topics),
            "state": self.state,
            "armedForNextRun": self.armed_for_next_run,
            "attachedRunId": self.attached_run_id,
            "lastSampleAt": self.last_sample_at,
            "lastStatusAt": self.last_status_at,
            "lastError": self.last_error,
            "quality": _quality_for_state(self.state),
            "recordingGateOpen": self.accepting_recording_samples,
            "adapterStatus": status,
        }


class SensorCommandError(ValueError):
    pass


class SensorManager:
    def __init__(
        self,
        *,
        broker: TopicBroker,
        runtime: HubRuntime,
        adapters: list[ManagedSensorAdapter],
        providers: list[SensorDiscoveryProvider] | None = None,
        preview_interval_seconds: float = 1.0,
        stale_timeout_seconds: float = 5.0,
        monotonic_clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if stale_timeout_seconds <= 0:
            raise ValueError("stale_timeout_seconds must be greater than zero")
        self.broker = broker
        self.runtime = runtime
        self.preview_interval_seconds = preview_interval_seconds
        self.stale_timeout_seconds = stale_timeout_seconds
        self._monotonic = monotonic_clock
        self._freshness_check_interval_seconds = max(
            0.01,
            min(1.0, stale_timeout_seconds / 2),
        )
        self._sensors = {adapter.sensor_id: ManagedSensorRecord(adapter=adapter) for adapter in adapters}
        self._providers = {provider.provider_id: provider for provider in (providers or [])}
        self._active_run_id: str | None = None
        self._message_task: asyncio.Task[None] | None = None
        self._freshness_task: asyncio.Task[None] | None = None
        self._consumer_tasks: dict[str, asyncio.Task[None]] = {}
        self._started = False

    async def start(self) -> None:
        if self._started:
            return
        hello = ClientHello(
            clientId=SENSOR_MANAGER_CLIENT_ID,
            role=ClientRole.SYSTEM.value,
            capabilities=["sensor-manager"],
            displayName="Sensor Manager",
            metadata={"topics": [Topic.SENSOR_COMMANDS.value, Topic.EXPERIENCE_LIFECYCLE.value]},
        )
        await self.broker.connect(hello)
        await self.broker.subscribe(
            SENSOR_MANAGER_CLIENT_ID,
            {Topic.SENSOR_COMMANDS.value, Topic.EXPERIENCE_LIFECYCLE.value},
        )
        self._started = True
        for provider in self._providers.values():
            await provider.prepare()
        for record in self._sensors.values():
            await self._publish_status(record, "configured")
        self._message_task = asyncio.create_task(self._run_message_loop())
        self._freshness_task = asyncio.create_task(self._run_freshness_loop())

    async def stop(self) -> None:
        cleanup_task = asyncio.create_task(self._finish_stop())
        try:
            await asyncio.shield(cleanup_task)
        except asyncio.CancelledError as cancellation:
            # Complete adapter/broker cleanup before allowing shutdown
            # cancellation to escape the manager.
            while not cleanup_task.done():
                try:
                    await asyncio.shield(cleanup_task)
                except asyncio.CancelledError:
                    continue
            cleanup_task.result()
            raise cancellation
        cleanup_task.result()

    async def _finish_stop(self) -> None:
        for record in self._sensors.values():
            self._close_recording_gate(record)

        current_task = asyncio.current_task()
        tasks = tuple(
            task
            for task in (self._message_task, self._freshness_task, *self._consumer_tasks.values())
            if task is not None and task is not current_task
        )
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

        self._message_task = None
        self._freshness_task = None
        self._consumer_tasks.clear()
        self._active_run_id = None
        for record in self._sensors.values():
            disconnect_error: str | None = None
            try:
                await record.adapter.disconnect()
            except asyncio.CancelledError:
                # An adapter must not abort the remaining shutdown cleanup if
                # its own disconnect path reports cancellation.
                disconnect_error = "adapter disconnect was cancelled during shutdown"
            except Exception as exc:
                disconnect_error = str(exc)
            record.accepting_recording_samples = False
            record.attached_run_id = None
            record.armed_for_next_run = False
            record.freshness_started_monotonic = None
            record.last_sample_monotonic = None
            record.stale_since_monotonic = None
            if disconnect_error is None:
                record.state = "configured"
                record.last_error = None
            else:
                record.state = "error"
                record.last_error = disconnect_error
        if self._started:
            try:
                await self.broker.disconnect(SENSOR_MANAGER_CLIENT_ID)
            except asyncio.CancelledError:
                # Keep the manager's lifecycle terminal even if broker cleanup
                # is interrupted by an adapter-specific cancellation.
                pass
            finally:
                self._started = False
        else:
            self._started = False

    def snapshot(self) -> dict[str, Any]:
        now = self._monotonic()
        records = sorted(self._sensors.values(), key=lambda item: item.adapter.sensor_id)
        sensors = [
            record.snapshot() | {"freshness": self._freshness_snapshot(record, now)}
            for record in records
        ]
        return {
            "clientId": SENSOR_MANAGER_CLIENT_ID,
            "sensorCount": len(sensors),
            "adapterCount": len({sensor["adapterId"] for sensor in sensors}),
            "armedCount": sum(1 for sensor in sensors if sensor["armedForNextRun"]),
            "recordingCount": sum(1 for record in records if record.accepting_recording_samples),
            "activeRunId": self._active_run_id,
            "providers": [
                provider.snapshot()
                for provider in sorted(self._providers.values(), key=lambda item: item.provider_id)
            ],
            "sensors": sensors,
        }

    async def _run_message_loop(self) -> None:
        connection = self.broker.get_client(SENSOR_MANAGER_CLIENT_ID)
        if connection is None:
            return
        while True:
            message = await connection.outbox.get()
            if message.topic == Topic.SENSOR_COMMANDS.value:
                await self._handle_command_message(message)
            elif message.topic == Topic.EXPERIENCE_LIFECYCLE.value:
                await self._handle_lifecycle_message(message)

    async def _run_freshness_loop(self) -> None:
        while True:
            await asyncio.sleep(self._freshness_check_interval_seconds)
            await self._check_sensor_freshness()

    async def _check_sensor_freshness(self) -> None:
        now = self._monotonic()
        for record in list(self._sensors.values()):
            if record.state not in {"connected", "recording"}:
                continue
            reference = (
                record.last_sample_monotonic
                if record.last_sample_monotonic is not None
                else record.freshness_started_monotonic
            )
            if reference is None:
                record.freshness_started_monotonic = now
                continue
            stale_timeout_seconds = self._stale_timeout_for(record)
            if stale_timeout_seconds is None:
                continue
            if now - reference < stale_timeout_seconds:
                continue
            record.state = "stale"
            record.stale_since_monotonic = now
            record.last_error = (
                f"no samples received for {stale_timeout_seconds:g} seconds"
            )
            await self._publish_status(record, "stale")

    async def _consume_sensor(self, record: ManagedSensorRecord) -> None:
        iterator = record.adapter.samples().__aiter__()
        try:
            while True:
                recording_run_id = (
                    record.attached_run_id if record.accepting_recording_samples else None
                )
                recording_generation = record.recording_generation
                try:
                    sample = await anext(iterator)
                except StopAsyncIteration:
                    break
                if record.state not in {"connected", "recording", "stale"}:
                    break
                record.last_sample_at = sample.collected_at or utc_now_iso()
                now = self._monotonic()
                record.last_sample_monotonic = now

                if record.state == "stale":
                    record.state = (
                        "recording"
                        if record.attached_run_id is not None and record.accepting_recording_samples
                        else "connected"
                    )
                    record.stale_since_monotonic = None
                    record.last_error = None
                    await self._publish_status(record, "recovered")

                if (
                    record.last_preview_monotonic is None
                    or now - record.last_preview_monotonic >= self.preview_interval_seconds
                ):
                    await self._publish_preview(record, sample)
                    record.last_preview_monotonic = now

                if recording_run_id is not None:
                    async with record.recording_lock:
                        if (
                            record.accepting_recording_samples
                            and record.recording_generation == recording_generation
                            and record.attached_run_id == recording_run_id
                        ):
                            await self._publish_recording_sample(record, sample, recording_run_id)
            if record.state in {"connected", "recording", "stale"}:
                raise RuntimeError("sensor sample stream ended unexpectedly")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # pragma: no cover - defensive boundary for adapters
            self._close_recording_gate(record)
            record.connection_generation += 1
            record.state = "error"
            record.armed_for_next_run = False
            record.stale_since_monotonic = None
            record.last_error = str(exc)
            cleanup_error: Exception | None = None
            try:
                await record.adapter.disconnect()
            except Exception as disconnect_exc:  # pragma: no cover - defensive cleanup
                cleanup_error = disconnect_exc
            record.last_error = _combined_error(exc, cleanup_error)
            await self._publish_status(record, "error")
        finally:
            current = asyncio.current_task()
            if self._consumer_tasks.get(record.adapter.sensor_id) is current:
                self._consumer_tasks.pop(record.adapter.sensor_id, None)

    async def _handle_lifecycle_message(self, message: MessageEnvelope) -> None:
        event = _read_string(message.payload.get("event"))
        run_id = _read_string(message.payload.get("runId"))
        if event not in {"started", "ended"} or run_id is None:
            return

        if event == "started":
            if self._active_run_id is not None and self._active_run_id != run_id:
                return
            self._active_run_id = run_id
        elif self._active_run_id is not None and self._active_run_id != run_id:
            return

        if event == "ended":
            for record in self._sensors.values():
                if record.attached_run_id == run_id:
                    async with record.recording_lock:
                        self._close_recording_gate(record)

        async def process_record(record: ManagedSensorRecord) -> None:
            try:
                if event == "started" and record.armed_for_next_run:
                    await self._attach(record, run_id)
                elif event == "ended" and record.attached_run_id == run_id:
                    await self._detach(record, run_id)
            except Exception as exc:  # pragma: no cover - defensive boundary for adapters
                if record.state != "error" or record.last_error != str(exc):
                    record.state = "error"
                    record.armed_for_next_run = False
                    record.last_error = str(exc)
                    await self._publish_status(record, "error")

        await asyncio.gather(
            *(process_record(record) for record in list(self._sensors.values()))
        )

        if event == "ended" and self._active_run_id == run_id:
            self._active_run_id = None

    async def _handle_command_message(self, message: MessageEnvelope) -> None:
        status = "accepted"
        detail: str | None = None
        try:
            await self._execute_command(message.payload)
        except SensorCommandError as exc:
            status = "rejected"
            detail = str(exc)
        except Exception as exc:  # pragma: no cover - defensive boundary for adapters
            status = "failed"
            detail = str(exc)

        if message.requiresAck:
            try:
                await self.runtime.handle_message(
                    MessageEnvelope(
                        type=MessageType.ACK,
                        clientId=SENSOR_MANAGER_CLIENT_ID,
                        payload=AckPayload(messageId=message.id, status=status, detail=detail).model_dump(mode="json"),
                    )
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                # A terminal logger failure must not kill the internal command
                # consumer. Health/status expose the persistence failure.
                pass

    async def _execute_command(self, payload: dict[str, Any]) -> None:
        action = _read_string(payload.get("action"))
        if action is None:
            raise SensorCommandError("sensor command requires payload.action")

        arguments = payload.get("arguments")
        if not isinstance(arguments, dict):
            arguments = {}

        if action == "sensor.scan":
            await self._scan()
            return

        sensor_id = _read_string(arguments.get("sensorId")) or _read_string(payload.get("sensorId"))
        if sensor_id is None:
            raise SensorCommandError(f"{action} requires arguments.sensorId")
        record = self._require_sensor(sensor_id)

        if action == "sensor.connect":
            await self._connect(record)
            return
        if action == "sensor.disconnect":
            await self._disconnect(record)
            return
        if action == "sensor.session.arm":
            await self._arm(record)
            return
        if action == "sensor.session.disarm":
            await self._disarm(record)
            return
        if action == "sensor.session.attach":
            run_id = _read_string(arguments.get("runId")) or _read_string(payload.get("runId"))
            if run_id is None:
                raise SensorCommandError("sensor.session.attach requires arguments.runId")
            await self._attach(record, run_id)
            return
        if action == "sensor.session.detach":
            run_id = _read_string(arguments.get("runId")) or _read_string(payload.get("runId")) or record.attached_run_id
            if run_id is None:
                raise SensorCommandError("sensor.session.detach requires arguments.runId")
            await self._detach(record, run_id)
            return

        raise SensorCommandError(f"unsupported sensor action: {action}")

    async def _scan(self) -> None:
        for record in list(self._sensors.values()):
            if record.provider_id is not None:
                continue
            available = await record.adapter.scan()
            if record.state == "stale":
                continue
            if record.state in {"connected", "recording"} or record.attached_run_id is not None:
                await self._publish_status(record, "scan")
                continue
            record.state = "available" if available else "configured"
            record.last_error = None
            await self._publish_status(record, "available" if available else "configured")

        for provider in self._providers.values():
            result = await provider.discover()
            if not result.scan_succeeded:
                # A failed scan is not evidence that a previously discovered
                # stream disappeared. Keep its card/state until a successful
                # scan confirms absence.
                continue
            discovered_ids: set[str] = set()
            for adapter in result.adapters:
                discovered_ids.add(adapter.sensor_id)
                existing = self._sensors.get(adapter.sensor_id)
                if existing is None:
                    record = ManagedSensorRecord(
                        adapter=adapter,
                        provider_id=provider.provider_id,
                        state="available",
                    )
                    self._sensors[adapter.sensor_id] = record
                    await self._publish_status(record, "discovered")
                    continue
                if existing.provider_id != provider.provider_id:
                    continue
                if existing.state == "stale" and existing.attached_run_id is None:
                    await self._stop_consumer(existing.adapter.sensor_id)
                    try:
                        await existing.adapter.disconnect()
                    except Exception as exc:
                        existing.state = "error"
                        existing.last_error = f"could not replace stale adapter: {exc}"
                        await self._publish_status(existing, "error")
                        continue
                    existing.adapter = adapter
                    existing.state = "available"
                    existing.last_error = None
                    existing.last_sample_at = None
                    existing.last_sample_monotonic = None
                    existing.freshness_started_monotonic = None
                    existing.stale_since_monotonic = None
                    existing.last_preview_monotonic = None
                elif existing.state == "stale":
                    # The stream is still attached, so keep the operational
                    # state as stale until a sample proves it recovered.
                    await self._publish_status(existing, "scan")
                    continue
                if existing.state not in {"connected", "recording", "stale"} and existing.attached_run_id is None:
                    existing.adapter = adapter
                    existing.state = "available"
                    existing.last_error = None
                await self._publish_status(existing, "available")

            for record in list(self._sensors.values()):
                if record.provider_id != provider.provider_id or record.adapter.sensor_id in discovered_ids:
                    continue
                if record.state in {"connected", "recording", "stale"} or record.attached_run_id is not None:
                    if record.state == "stale":
                        continue
                    record.state = "stale"
                    record.stale_since_monotonic = self._monotonic()
                    record.last_error = "stream not found during latest scan"
                    await self._publish_status(record, "stale")
                else:
                    record.state = "disconnected"
                    record.last_error = "stream is no longer available"
                    await self._publish_status(record, "unavailable")

    async def _connect(self, record: ManagedSensorRecord) -> None:
        if record.attached_run_id is not None:
            raise SensorCommandError(f"sensor {record.adapter.sensor_id} must detach before reconnect")
        if record.state in {"connected", "recording", "stale"}:
            await self._publish_status(record, "status")
            return
        await self._wait_for_consumer_cleanup(record.adapter.sensor_id)
        record.state = "connecting"
        await self._publish_status(record, "connecting")
        try:
            await record.adapter.connect()
        except Exception as exc:
            self._close_recording_gate(record)
            cleanup_error: Exception | None = None
            try:
                await record.adapter.disconnect()
            except Exception as disconnect_exc:  # pragma: no cover - defensive cleanup
                cleanup_error = disconnect_exc
            record.state = "error"
            record.armed_for_next_run = False
            record.last_error = _combined_error(exc, cleanup_error)
            await self._publish_status(record, "error")
            raise
        record.state = "connected"
        record.connection_generation += 1
        record.last_error = None
        record.last_sample_at = None
        record.last_sample_monotonic = None
        record.freshness_started_monotonic = self._monotonic()
        record.stale_since_monotonic = None
        record.last_preview_monotonic = None
        self._start_consumer(record)
        await self._publish_status(record, "connected")

    async def _disconnect(self, record: ManagedSensorRecord) -> None:
        if record.armed_for_next_run or record.state == "recording" or record.attached_run_id is not None:
            raise SensorCommandError(f"sensor {record.adapter.sensor_id} must detach before disconnect")
        record.connection_generation += 1
        await self._stop_consumer(record.adapter.sensor_id)
        try:
            await record.adapter.disconnect()
        except asyncio.CancelledError:
            record.state = "error"
            record.armed_for_next_run = False
            record.attached_run_id = None
            record.last_error = "sensor disconnect was cancelled"
            record.freshness_started_monotonic = None
            record.last_sample_monotonic = None
            record.stale_since_monotonic = None
            try:
                await self._publish_status(record, "error")
            except Exception:
                pass
            raise
        except Exception as exc:
            # The consumer has already stopped. Keep the failure visible and
            # leave the record retryable instead of falsely reporting a clean
            # disconnect with no consumer behind it.
            record.state = "error"
            record.armed_for_next_run = False
            record.attached_run_id = None
            record.last_error = str(exc)
            record.freshness_started_monotonic = None
            record.last_sample_monotonic = None
            record.stale_since_monotonic = None
            await self._publish_status(record, "error")
            raise
        record.state = "disconnected"
        record.armed_for_next_run = False
        record.attached_run_id = None
        record.last_error = None
        record.freshness_started_monotonic = None
        record.last_sample_monotonic = None
        record.stale_since_monotonic = None
        await self._publish_status(record, "disconnected")

    def _start_consumer(self, record: ManagedSensorRecord) -> None:
        task = self._consumer_tasks.get(record.adapter.sensor_id)
        if task is not None and not task.done():
            return
        self._consumer_tasks[record.adapter.sensor_id] = asyncio.create_task(
            self._consume_sensor(record)
        )

    async def _wait_for_consumer_cleanup(self, sensor_id: str) -> None:
        task = self._consumer_tasks.get(sensor_id)
        if task is None or task is asyncio.current_task():
            return
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            if not task.cancelled():
                raise
        except Exception:
            pass
        finally:
            if task.done() and self._consumer_tasks.get(sensor_id) is task:
                self._consumer_tasks.pop(sensor_id, None)

    async def _stop_consumer(self, sensor_id: str) -> None:
        task = self._consumer_tasks.pop(sensor_id, None)
        if task is None:
            return
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    async def _arm(self, record: ManagedSensorRecord) -> None:
        if record.armed_for_next_run:
            await self._publish_status(record, "armed")
            return
        if record.state == "recording" or record.attached_run_id is not None:
            raise SensorCommandError(f"sensor {record.adapter.sensor_id} is already attached to a run")
        if record.state not in {"connected", "stale"}:
            raise SensorCommandError(f"sensor {record.adapter.sensor_id} must be connected before arm")
        record.armed_for_next_run = True
        record.attached_run_id = None
        if record.state != "stale":
            record.last_error = None
        await self._publish_status(record, "armed")

    async def _disarm(self, record: ManagedSensorRecord) -> None:
        if record.state == "recording" or record.attached_run_id is not None:
            raise SensorCommandError(f"sensor {record.adapter.sensor_id} must detach from its run")
        if not record.armed_for_next_run:
            await self._publish_status(record, "connected")
            return
        record.armed_for_next_run = False
        record.attached_run_id = None
        if record.state != "stale":
            record.last_error = None
        await self._publish_status(record, "disarmed")

    async def _attach(self, record: ManagedSensorRecord, run_id: str) -> None:
        if record.attached_run_id is not None:
            if record.attached_run_id == run_id:
                active_run_id = self.runtime.experience_lifecycle_snapshot()["activeRunId"]
                if active_run_id != run_id:
                    raise SensorCommandError(
                        f"sensor {record.adapter.sensor_id} cannot attach without active lifecycle run {run_id}"
                    )
                if not record.accepting_recording_samples:
                    raise SensorCommandError(
                        f"sensor {record.adapter.sensor_id} is attached to {run_id} but its recording gate is closed"
                    )
                await self._publish_status(record, record.state)
                return
            raise SensorCommandError(f"sensor {record.adapter.sensor_id} is already attached to another run")
        active_run_id = self.runtime.experience_lifecycle_snapshot()["activeRunId"]
        if active_run_id is None:
            raise SensorCommandError(
                f"sensor {record.adapter.sensor_id} cannot attach without an active experience lifecycle"
            )
        if active_run_id != run_id:
            raise SensorCommandError(
                f"sensor {record.adapter.sensor_id} cannot attach to {run_id}; active experience run is {active_run_id}"
            )
        if record.state not in {"connected", "stale"}:
            raise SensorCommandError(f"sensor {record.adapter.sensor_id} must be connected before attach")
        was_stale = record.state == "stale"
        connection_generation = record.connection_generation
        consumer_task = self._consumer_tasks.get(record.adapter.sensor_id)
        await record.adapter.start_recording(run_id)
        adapter_status = record.adapter.status()
        attach_invalid_reason: str | None = None
        if record.connection_generation != connection_generation:
            attach_invalid_reason = "the sensor connection changed during adapter startup"
        elif record.state not in {"connected", "stale"}:
            attach_invalid_reason = f"the sensor entered state {record.state} during adapter startup"
        elif not adapter_status.get("connected", True):
            attach_invalid_reason = "the adapter disconnected during startup"
        elif (
            consumer_task is None
            or consumer_task.done()
            or self._consumer_tasks.get(record.adapter.sensor_id) is not consumer_task
        ):
            attach_invalid_reason = "the sensor sample consumer stopped during adapter startup"

        if attach_invalid_reason is not None:
            self._close_recording_gate(record)
            try:
                await record.adapter.stop_recording(run_id)
            except Exception as exc:
                record.state = "error"
                record.attached_run_id = run_id
                record.armed_for_next_run = False
                record.last_error = (
                    f"attach to {run_id} was cancelled because {attach_invalid_reason}; "
                    f"adapter rollback failed: {exc}"
                )
                await self._publish_status(record, "error")
                raise RuntimeError(record.last_error) from exc
            raise SensorCommandError(
                f"sensor {record.adapter.sensor_id} attach to {run_id} was cancelled; "
                f"{attach_invalid_reason}"
            )

        record.armed_for_next_run = False
        active_run_id = self.runtime.experience_lifecycle_snapshot()["activeRunId"]
        if active_run_id != run_id:
            self._close_recording_gate(record)
            try:
                await record.adapter.stop_recording(run_id)
            except Exception as exc:
                record.state = "error"
                record.attached_run_id = run_id
                record.last_error = (
                    f"lifecycle changed while attaching {run_id}; "
                    f"adapter rollback failed: {exc}"
                )
                await self._publish_status(record, "error")
                raise RuntimeError(record.last_error) from exc
            record.state = "stale" if was_stale else "connected"
            record.attached_run_id = None
            if not was_stale:
                record.last_error = None
            if active_run_id is None:
                raise SensorCommandError(
                    f"sensor {record.adapter.sensor_id} attach to {run_id} was cancelled; "
                    "the experience lifecycle ended during adapter startup"
                )
            raise SensorCommandError(
                f"sensor {record.adapter.sensor_id} attach to {run_id} was cancelled; "
                f"active experience run changed to {active_run_id}"
            )
        record.state = "stale" if was_stale else "recording"
        record.attached_run_id = run_id
        self._open_recording_gate(record)
        if not was_stale:
            record.last_error = None
        session_published = False
        try:
            await self._publish_session(record, "attached", run_id)
            session_published = True
            await self._publish_status(record, "attached")
        except BaseException as exc:
            await self._rollback_attach_safely(
                record,
                run_id,
                was_stale,
                session_published,
                exc,
            )
            raise

    async def _rollback_attach_safely(
        self,
        record: ManagedSensorRecord,
        run_id: str,
        was_stale: bool,
        session_published: bool,
        cause: BaseException,
    ) -> None:
        cleanup_task = asyncio.create_task(
            self._rollback_attach(
                record,
                run_id,
                was_stale,
                session_published,
                cause,
            )
        )
        try:
            await asyncio.shield(cleanup_task)
        except asyncio.CancelledError:
            while not cleanup_task.done():
                try:
                    await asyncio.shield(cleanup_task)
                except asyncio.CancelledError:
                    continue
        if cleanup_task.done() and not cleanup_task.cancelled():
            cleanup_task.result()

    async def _rollback_attach(
        self,
        record: ManagedSensorRecord,
        run_id: str,
        was_stale: bool,
        session_published: bool,
        cause: BaseException,
    ) -> None:
        self._close_recording_gate(record)
        rollback_error: str | None = None
        try:
            await record.adapter.stop_recording(run_id)
        except asyncio.CancelledError:
            rollback_error = "adapter rollback was cancelled"
        except Exception as exc:
            rollback_error = str(exc)

        record.attached_run_id = None
        record.armed_for_next_run = False
        if rollback_error is not None:
            record.state = "error"
            record.last_error = (
                f"attach to {run_id} was rolled back after {cause}; "
                f"adapter rollback failed: {rollback_error}"
            )
        else:
            adapter_status = record.adapter.status()
            if adapter_status.get("connected", True):
                record.state = "stale" if was_stale else "connected"
                if not was_stale:
                    record.last_error = None
            else:
                record.state = "disconnected"
                record.last_error = None
                record.freshness_started_monotonic = None
                record.last_sample_monotonic = None
                record.stale_since_monotonic = None
        if session_published:
            try:
                await self._publish_session(record, "detached", run_id)
            except Exception:
                # If persistence is already in a terminal error state, the
                # state rollback still prevents future samples from crossing
                # the closed gate.
                pass
        try:
            await self._publish_status(record, "attach-rollback")
        except Exception:
            # The original failure is more useful to the command caller than
            # a second error caused while reporting recovery.
            pass

    async def _detach(self, record: ManagedSensorRecord, run_id: str) -> None:
        async with record.recording_lock:
            if record.attached_run_id is None:
                raise SensorCommandError(f"sensor {record.adapter.sensor_id} is not attached")
            if record.attached_run_id != run_id:
                raise SensorCommandError(f"sensor {record.adapter.sensor_id} is attached to another run")
            self._close_recording_gate(record)
            try:
                await record.adapter.stop_recording(run_id)
            except Exception as exc:
                record.state = "error"
                record.armed_for_next_run = False
                record.last_error = str(exc)
                await self._publish_status(record, "error")
                raise
            was_stale = record.state == "stale"
            adapter_status = record.adapter.status()
            if adapter_status.get("connected", True):
                await self._stop_consumer(record.adapter.sensor_id)
                record.state = "stale" if was_stale else "connected"
                self._start_consumer(record)
            else:
                await self._stop_consumer(record.adapter.sensor_id)
                record.state = "disconnected"
                record.freshness_started_monotonic = None
                record.last_sample_monotonic = None
                record.stale_since_monotonic = None
                record.last_error = None
            record.attached_run_id = None
            if not was_stale:
                record.last_error = None
            await self._publish_session(record, "detached", run_id)
            await self._publish_status(record, record.state)

    def _open_recording_gate(self, record: ManagedSensorRecord) -> None:
        record.recording_generation += 1
        record.accepting_recording_samples = True

    def _close_recording_gate(self, record: ManagedSensorRecord) -> None:
        if record.accepting_recording_samples:
            record.recording_generation += 1
        record.accepting_recording_samples = False

    def _require_sensor(self, sensor_id: str) -> ManagedSensorRecord:
        record = self._sensors.get(sensor_id)
        if record is None:
            raise SensorCommandError(f"unknown sensor: {sensor_id}")
        return record

    async def _publish_status(self, record: ManagedSensorRecord, event: str) -> None:
        record.last_status_at = utc_now_iso()
        await self.runtime.handle_message(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId=SENSOR_MANAGER_CLIENT_ID,
                topic=Topic.SENSOR_STATUS,
                payload={
                    "event": event,
                    "sensorId": record.adapter.sensor_id,
                    "adapterId": record.adapter.adapter_id,
                    "providerId": record.provider_id,
                    "source": record.adapter.source,
                    "displayName": record.adapter.display_name,
                    "deviceType": record.adapter.device_type,
                    "state": record.state,
                    "armedForNextRun": record.armed_for_next_run,
                    "topics": list(record.adapter.topics),
                    "quality": _quality_for_state(record.state),
                    "recordingGateOpen": record.accepting_recording_samples,
                    "freshness": self._freshness_snapshot(record, self._monotonic()),
                    "attachedRunId": record.attached_run_id,
                    "lastSampleAt": record.last_sample_at,
                    "error": record.last_error,
                    "adapterStatus": record.adapter.status(),
                },
            )
        )

    def _freshness_snapshot(
        self,
        record: ManagedSensorRecord,
        now: float,
    ) -> dict[str, Any]:
        reference = (
            record.last_sample_monotonic
            if record.last_sample_monotonic is not None
            else record.freshness_started_monotonic
        )
        age_ms = None if reference is None else round(max(0.0, now - reference) * 1000, 3)
        if record.state == "stale":
            status = "stale"
        elif record.state in {"connected", "recording"}:
            status = "fresh"
        else:
            status = "unknown"
        stale_timeout_seconds = self._stale_timeout_for(record)
        return {
            "status": status,
            "ageMs": age_ms,
            "staleForMs": (
                None
                if record.stale_since_monotonic is None
                else round(max(0.0, now - record.stale_since_monotonic) * 1000, 3)
            ),
            "staleAfterMs": (
                None
                if stale_timeout_seconds is None
                else round(stale_timeout_seconds * 1000, 3)
            ),
            "hasReceivedSample": record.last_sample_monotonic is not None,
        }

    def _stale_timeout_for(self, record: ManagedSensorRecord) -> float | None:
        adapter_status = record.adapter.status()
        stream = adapter_status.get("stream")
        if not isinstance(stream, dict):
            return self.stale_timeout_seconds
        nominal_rate = stream.get("nominalSrateHz")
        if not isinstance(nominal_rate, (int, float)) or isinstance(nominal_rate, bool):
            return self.stale_timeout_seconds
        if nominal_rate == 0:
            return None
        if nominal_rate < 0:
            return self.stale_timeout_seconds
        return max(self.stale_timeout_seconds, 3.0 / float(nominal_rate))

    async def _publish_session(self, record: ManagedSensorRecord, event: str, run_id: str) -> None:
        await self.runtime.handle_message(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId=SENSOR_MANAGER_CLIENT_ID,
                topic=Topic.SENSOR_SESSION,
                payload={
                    "event": event,
                    "sensorId": record.adapter.sensor_id,
                    "adapterId": record.adapter.adapter_id,
                    "providerId": record.provider_id,
                    "source": record.adapter.source,
                    "runId": run_id,
                    "topics": list(record.adapter.topics),
                    "adapterStatus": record.adapter.status(),
                },
            )
        )

    async def _publish_preview(self, record: ManagedSensorRecord, sample: SensorSample) -> None:
        await self.runtime.handle_message(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId=SENSOR_MANAGER_CLIENT_ID,
                topic=Topic.SENSOR_PREVIEW,
                collectedAt=sample.collected_at,
                sessionTimeMs=sample.session_time_ms,
                payload={
                    "sensorId": record.adapter.sensor_id,
                    "sourceTopic": sample.topic,
                    "sequence": (sample.preview_payload or sample.payload).get("sequence"),
                    "sample": sample.preview_payload or sample.payload,
                },
            )
        )

    async def _publish_recording_sample(
        self,
        record: ManagedSensorRecord,
        sample: SensorSample,
        run_id: str,
    ) -> None:
        await self.runtime.handle_message(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId=SENSOR_MANAGER_CLIENT_ID,
                topic=sample.topic,
                collectedAt=sample.collected_at,
                sessionTimeMs=sample.session_time_ms,
                payload=sample.payload
                | {
                    "sensorId": record.adapter.sensor_id,
                    "runId": run_id,
                    "deviceType": record.adapter.device_type,
                },
            )
        )


def _read_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _combined_error(primary: Exception, cleanup: Exception | None) -> str:
    if cleanup is None:
        return str(primary)
    return f"{primary}; cleanup failed: {cleanup}"


def _quality_for_state(state: str) -> str:
    if state in {"connected", "recording"}:
        return "good"
    if state == "stale":
        return "stale"
    return "unknown"
