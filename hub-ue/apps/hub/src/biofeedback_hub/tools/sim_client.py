from __future__ import annotations

import argparse
import asyncio
import json
import math
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from biofeedback_hub.adapters.simulator_eeg import SimulatedEegAdapter
from biofeedback_hub.adapters.simulator_hrv import SimulatedHrvAdapter
from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.envelope import ClientHello, ClientRole, MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic

SUPPORTED_UNREAL_COMMANDS = {"pause-session", "resume-session", "add-marker"}
MULTI_SENSOR_TOPICS = [
    Topic.HRV_RAW.value,
    "ecg.raw",
    "imu.accelerometer.raw",
    "temperature.raw",
    "air.quality.raw",
]


@dataclass(frozen=True)
class SimulatedSensorProfile:
    client_id: str
    display_name: str
    device_type: str
    topic: str
    interval_seconds: float
    payload_factory: Callable[[int, float], dict[str, Any]]


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a simulated biofeedback hub client.")
    parser.add_argument("--url", default="ws://127.0.0.1:8787/ws")
    parser.add_argument("--token", default=None)
    parser.add_argument("--mode", choices=["logger", "hrv", "eeg", "unreal", "multi-sensor"], default="logger")
    args = parser.parse_args()

    asyncio.run(run_client(args.url, args.mode, args.token))


async def run_client(url: str, mode: str, token: str | None) -> None:
    try:
        import websockets
    except ImportError as exc:
        raise RuntimeError("Install hub dependencies with: python -m pip install -e apps/hub") from exc

    if mode == "multi-sensor":
        await _run_multi_sensor_demo(websockets, url, token)
        return

    connect_url = f"{url}?token={token}" if token else url
    async with websockets.connect(connect_url) as socket:
        client_id = f"{mode}-sim" if mode != "unreal" else "unreal-quest-sim"
        role = ClientRole.SENSOR if mode in {"hrv", "eeg"} else ClientRole(mode)
        await socket.send(
            MessageEnvelope(
                type=MessageType.HELLO,
                clientId=client_id,
                payload=ClientHello(clientId=client_id, role=role, capabilities=[mode]).model_dump(mode="json"),
            ).model_dump_json()
        )

        if mode == "logger":
            await _run_logger(socket, client_id)
        elif mode == "hrv":
            await _run_sensor(socket, client_id, SimulatedHrvAdapter())
        elif mode == "eeg":
            await _run_sensor(socket, client_id, SimulatedEegAdapter())
        else:
            await _run_unreal(socket, client_id)


async def _run_logger(socket: Any, client_id: str) -> None:
    await socket.send(
        MessageEnvelope(
            type=MessageType.SUBSCRIBE,
            clientId=client_id,
            payload={"topics": logger_subscription_topics()},
        ).model_dump_json()
    )
    while True:
        print(await socket.recv())


def logger_subscription_topics() -> list[str]:
    return [
        Topic.EXPERIENCE_LIFECYCLE.value,
        Topic.EXPERIENCE_MARKER.value,
        Topic.UNREAL_STATE.value,
        Topic.HRV_RAW.value,
        Topic.HRV_PROCESSED.value,
        "ecg.raw",
        "imu.accelerometer.raw",
        "temperature.raw",
        "air.quality.raw",
        Topic.EEG_RAW.value,
        Topic.EEG_PROCESSED.value,
        Topic.BIOFEEDBACK_EVENTS.value,
        Topic.AI_INPUT.value,
        Topic.AI_OUTPUT.value,
        Topic.LOGGER_EVENTS.value,
        Topic.SYSTEM_EVENTS.value,
    ]


def build_experience_lifecycle_payload(
    event: str,
    *,
    run_id: str | None = None,
    label: str | None = None,
    source: str = "xr",
    reason: str | None = None,
) -> dict[str, Any]:
    lifecycle_event = event.strip().lower()
    payload: dict[str, Any] = {
        "event": lifecycle_event,
        "runId": run_id or str(uuid.uuid4()),
        "source": source.strip() or "xr",
    }
    lifecycle_label = read_trimmed_string(label)
    lifecycle_reason = read_trimmed_string(reason)
    if lifecycle_label:
        payload["label"] = lifecycle_label
    if lifecycle_reason:
        payload["reason"] = lifecycle_reason
    return payload


def build_unreal_state_payload(
    state: str = "running",
    *,
    command_id: str | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    normalized_state = state.lower()
    status = "idle" if normalized_state == "paused" else "online"
    fps = 0 if normalized_state == "paused" else 72
    payload: dict[str, Any] = {"state": normalized_state, "status": status, "fps": fps}
    if command_id:
        payload["lastCommandId"] = command_id
    if reason:
        payload["reason"] = reason
    return payload


def next_unreal_state_payload_for_command(message: dict[str, Any]) -> dict[str, Any] | None:
    payload = message.get("payload")
    if not isinstance(payload, dict):
        return None

    action = payload.get("action")
    if action == "pause-session":
        state = "paused"
    elif action == "resume-session":
        state = "running"
    else:
        return None

    arguments = payload.get("arguments")
    reason = arguments.get("reason") if isinstance(arguments, dict) else None
    return build_unreal_state_payload(
        state,
        command_id=message.get("id"),
        reason=reason if isinstance(reason, str) else None,
    )


def next_experience_marker_payload_for_command(message: dict[str, Any]) -> dict[str, Any] | None:
    payload = message.get("payload")
    if not isinstance(payload, dict) or payload.get("action") != "add-marker":
        return None

    arguments = payload.get("arguments")
    if not isinstance(arguments, dict):
        return None

    label = read_trimmed_string(arguments.get("label"))
    if not label:
        return None

    command_id = read_trimmed_string(message.get("id"))
    marker_id = read_trimmed_string(arguments.get("markerId")) or command_id
    if not marker_id:
        return None

    marker: dict[str, Any] = {
        "markerId": marker_id,
        "commandId": command_id,
        "label": label,
        "source": "dashboard",
    }
    note = read_trimmed_string(arguments.get("note"))
    reason = read_trimmed_string(arguments.get("reason"))
    if note:
        marker["note"] = note
    if reason:
        marker["reason"] = reason
    return marker


def build_unreal_command_ack_payload(message: dict[str, Any]) -> dict[str, Any]:
    payload = message.get("payload")
    action = payload.get("action") if isinstance(payload, dict) else None
    if action == "add-marker" and next_experience_marker_payload_for_command(message) is None:
        return {
            "messageId": message.get("id"),
            "status": "rejected",
            "detail": "Marker label is required.",
        }
    if isinstance(action, str) and action in SUPPORTED_UNREAL_COMMANDS:
        return {"messageId": message.get("id"), "status": "accepted"}
    return {
        "messageId": message.get("id"),
        "status": "rejected",
        "detail": f"Unsupported command action '{action or '<empty>'}'.",
    }


async def _run_sensor(socket: Any, client_id: str, adapter: Any) -> None:
    async for sample in adapter.samples():
        await socket.send(
            MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId=client_id,
                topic=sample.topic,
                collectedAt=sample.collected_at,
                sessionTimeMs=sample.session_time_ms,
                payload=sample.payload,
            ).model_dump_json()
        )


async def _run_multi_sensor_demo(websockets: Any, url: str, token: str | None) -> None:
    await asyncio.gather(
        *(
            _run_simulated_sensor_client(websockets, url, token, profile)
            for profile in multi_sensor_profiles()
        )
    )


async def _run_simulated_sensor_client(
    websockets: Any,
    url: str,
    token: str | None,
    profile: SimulatedSensorProfile,
) -> None:
    connect_url = f"{url}?token={token}" if token else url
    started = time.monotonic()
    async with websockets.connect(connect_url) as socket:
        await socket.send(
            MessageEnvelope(
                type=MessageType.HELLO,
                clientId=profile.client_id,
                payload=ClientHello(
                    clientId=profile.client_id,
                    role=ClientRole.SENSOR,
                    capabilities=[profile.topic, profile.device_type],
                    displayName=profile.display_name,
                    deviceType=profile.device_type,
                    metadata={
                        "contract": profile.topic,
                        "topic": profile.topic,
                        "topics": [profile.topic],
                        "simulated": True,
                    },
                ).model_dump(mode="json"),
            ).model_dump_json()
        )

        sequence = 0
        while True:
            elapsed_seconds = time.monotonic() - started
            await socket.send(
                MessageEnvelope(
                    type=MessageType.PUBLISH,
                    clientId=profile.client_id,
                    topic=profile.topic,
                    collectedAt=utc_now_iso(),
                    sessionTimeMs=int(elapsed_seconds * 1000),
                    payload=profile.payload_factory(sequence, elapsed_seconds),
                ).model_dump_json()
            )
            sequence += 1
            await asyncio.sleep(profile.interval_seconds)


def multi_sensor_profiles() -> list[SimulatedSensorProfile]:
    return [
        SimulatedSensorProfile(
            client_id="hrv-strap-sim",
            display_name="Cinta HRV Simulada",
            device_type="hrv-strap",
            topic=Topic.HRV_RAW.value,
            interval_seconds=1.0,
            payload_factory=_build_hrv_payload,
        ),
        SimulatedSensorProfile(
            client_id="ecg-patch-sim",
            display_name="ECG Simulado",
            device_type="ecg-patch",
            topic="ecg.raw",
            interval_seconds=0.8,
            payload_factory=_build_ecg_payload,
        ),
        SimulatedSensorProfile(
            client_id="imu-torso-sim",
            display_name="IMU Torso Simulado",
            device_type="imu",
            topic="imu.accelerometer.raw",
            interval_seconds=0.5,
            payload_factory=_build_imu_payload,
        ),
        SimulatedSensorProfile(
            client_id="temperature-room-sim",
            display_name="Temperatura Ambiente Simulada",
            device_type="temperature-probe",
            topic="temperature.raw",
            interval_seconds=1.5,
            payload_factory=_build_temperature_payload,
        ),
        SimulatedSensorProfile(
            client_id="air-quality-sim",
            display_name="Qualidade do Ar Simulada",
            device_type="air-quality-monitor",
            topic="air.quality.raw",
            interval_seconds=1.2,
            payload_factory=_build_air_quality_payload,
        ),
    ]


def _build_hrv_payload(sequence: int, elapsed_seconds: float) -> dict[str, Any]:
    bpm = 72 + int(math.sin(sequence / 5) * 5)
    rr_ms = round(60000 / bpm, 2)
    return {
        "bpm": bpm,
        "rrMs": rr_ms,
        "ibiMs": [round(rr_ms - 4.5, 2), round(rr_ms + 3.2, 2)],
        "hrStatus": 1,
        "unit": "bpm",
        "sequence": sequence,
        "source": "multi-sensor-demo",
    }


def _build_ecg_payload(sequence: int, elapsed_seconds: float) -> dict[str, Any]:
    samples = [
        round(math.sin(elapsed_seconds * 8 + offset / 2) * 0.22 + math.sin(sequence / 6) * 0.04, 4)
        for offset in range(8)
    ]
    return {
        "value": samples[-1],
        "unit": "mV",
        "ecg": samples,
        "sampleRateHz": 250,
        "lead": "Lead I",
        "sequence": sequence,
        "source": "multi-sensor-demo",
    }


def _build_imu_payload(sequence: int, elapsed_seconds: float) -> dict[str, Any]:
    return {
        "x": round(math.sin(elapsed_seconds * 1.7) * 0.12, 3),
        "y": round(math.cos(elapsed_seconds * 1.2) * 0.08, 3),
        "z": round(0.98 + math.sin(sequence / 8) * 0.04, 3),
        "unit": "g",
        "sequence": sequence,
        "source": "multi-sensor-demo",
    }


def _build_temperature_payload(sequence: int, elapsed_seconds: float) -> dict[str, Any]:
    return {
        "value": round(24.5 + math.sin(elapsed_seconds / 10) * 0.7, 2),
        "unit": "C",
        "sequence": sequence,
        "source": "multi-sensor-demo",
    }


def _build_air_quality_payload(sequence: int, elapsed_seconds: float) -> dict[str, Any]:
    return {
        "co2Ppm": round(520 + math.sin(elapsed_seconds / 8) * 35, 1),
        "vocIndex": round(80 + math.cos(elapsed_seconds / 12) * 9, 1),
        "pm25": round(4.5 + math.sin(sequence / 4) * 0.8, 2),
        "unit": "mixed",
        "sequence": sequence,
        "source": "multi-sensor-demo",
    }


async def _run_unreal(socket: Any, client_id: str) -> None:
    started = time.monotonic()
    lifecycle_run_id = f"unreal-sim-{uuid.uuid4()}"
    state_payload = build_unreal_state_payload("running")
    send_lock = asyncio.Lock()
    await socket.send(
        MessageEnvelope(
            type=MessageType.SUBSCRIBE,
            clientId=client_id,
            payload={"topics": [Topic.UNREAL_COMMANDS.value]},
        ).model_dump_json()
    )

    async def publish_state() -> None:
        while True:
            async with send_lock:
                await send_unreal_state(socket, client_id, started, state_payload)
            await asyncio.sleep(2)

    async def receive_commands() -> None:
        nonlocal state_payload
        while True:
            raw = await socket.recv()
            message = json.loads(raw)
            print(raw)
            if message.get("requiresAck"):
                async with send_lock:
                    await socket.send(
                        MessageEnvelope(
                            type=MessageType.ACK,
                            clientId=client_id,
                            correlationId=message.get("id"),
                            payload=build_unreal_command_ack_payload(message),
                        ).model_dump_json()
                    )
                    next_state = next_unreal_state_payload_for_command(message)
                    if next_state is not None:
                        state_payload = next_state
                        await send_unreal_state(socket, client_id, started, state_payload)
                    marker_payload = next_experience_marker_payload_for_command(message)
                    if marker_payload is not None:
                        await send_experience_marker(socket, client_id, started, marker_payload)

    await send_experience_lifecycle(
        socket,
        client_id,
        started,
        build_experience_lifecycle_payload("started", run_id=lifecycle_run_id, label="Unreal simulator"),
    )
    await asyncio.gather(publish_state(), receive_commands())


async def send_unreal_state(socket: Any, client_id: str, started: float, payload: dict[str, Any]) -> None:
    elapsed_ms = int((time.monotonic() - started) * 1000)
    await socket.send(
        MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId=client_id,
            topic=Topic.UNREAL_STATE,
            sessionTimeMs=elapsed_ms,
            payload=payload,
        ).model_dump_json()
    )


async def send_experience_marker(socket: Any, client_id: str, started: float, payload: dict[str, Any]) -> None:
    elapsed_ms = int((time.monotonic() - started) * 1000)
    await socket.send(
        MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId=client_id,
            topic=Topic.EXPERIENCE_MARKER,
            sessionTimeMs=elapsed_ms,
            payload=payload,
        ).model_dump_json()
    )


async def send_experience_lifecycle(socket: Any, client_id: str, started: float, payload: dict[str, Any]) -> None:
    elapsed_ms = int((time.monotonic() - started) * 1000)
    await socket.send(
        MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId=client_id,
            topic=Topic.EXPERIENCE_LIFECYCLE,
            sessionTimeMs=elapsed_ms,
            payload=payload,
        ).model_dump_json()
    )


def read_trimmed_string(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


if __name__ == "__main__":
    main()
