from __future__ import annotations

import argparse
import asyncio
import json
import time
from datetime import datetime, timezone
from typing import Any

import websockets

from biofeedback_hub.schemas.envelope import (
    ClientHello,
    ClientRole,
    MessageEnvelope,
    MessageType,
)
from biofeedback_hub.schemas.topics import Topic


DEFAULT_POLAR_WS = "ws://localhost:8765/stream"
DEFAULT_POLAR_CONTROL_WS = "ws://localhost:8765/control"
DEFAULT_HUB_WS = "ws://127.0.0.1:8787/ws"
DEFAULT_CLIENT_ID = "polar-h10"
DEFAULT_SOURCE = "polar-h10-driver"
DEFAULT_DEVICE = "polar-h10"
POLAR_RECONNECT_INITIAL_SECONDS = 1.0
POLAR_RECONNECT_MAX_SECONDS = 10.0

JsonDict = dict[str, Any]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_float(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def safe_int(value: Any) -> int | None:
    try:
        return None if value is None else int(value)
    except (TypeError, ValueError):
        return None


def unix_timestamp_to_iso(value: Any) -> str | None:
    timestamp = safe_float(value)
    if timestamp is None or timestamp <= 0:
        return None
    try:
        return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z")
    except (OverflowError, OSError, ValueError):
        return None


def seconds_to_ms(value: Any) -> float | None:
    value_float = safe_float(value)
    return None if value_float is None else value_float * 1000.0


def normalize_samples(samples: Any) -> list[float]:
    if not isinstance(samples, list):
        return []
    return [value for sample in samples if (value := safe_float(sample)) is not None]


def compact(payload: JsonDict) -> JsonDict:
    return {key: value for key, value in payload.items() if value is not None}


def make_hello(client_id: str) -> MessageEnvelope:
    return MessageEnvelope(
        type=MessageType.HELLO,
        clientId=client_id,
        payload=ClientHello(
            clientId=client_id,
            role=ClientRole.SENSOR,
            capabilities=[
                "polar-h10",
                "ecg",
                "rr",
                "hr",
                "hrv",
                "recording-control",
                "websocket-client",
            ],
        ).model_dump(mode="json"),
    )


def make_subscribe(client_id: str, topics: list[Topic]) -> MessageEnvelope:
    return MessageEnvelope(
        type=MessageType.SUBSCRIBE,
        clientId=client_id,
        payload={"topics": [topic.value for topic in topics]},
    )


def convert_polar_packet(
    packet: JsonDict,
    *,
    client_id: str,
    source: str,
    device: str,
    start_time: float,
    include_raw_packet: bool,
    bridge_received_at: str | None = None,
) -> MessageEnvelope:
    metrics = packet.get("metrics") or {}
    if not isinstance(metrics, dict):
        metrics = {}

    rr_ms = seconds_to_ms(metrics.get("rr"))
    ecg_samples = normalize_samples(packet.get("samples"))
    bridge_received_at = bridge_received_at or utc_now_iso()
    driver_timestamp = safe_float(packet.get("timestamp"))
    driver_collected_at = unix_timestamp_to_iso(driver_timestamp)
    collected_at = driver_collected_at or bridge_received_at
    collected_at_source = "driver-packet-timestamp" if driver_collected_at else "bridge-receipt-fallback"

    payload: JsonDict = {
        "bpm": safe_float(metrics.get("hr")),
        "rrMs": rr_ms,
        "rmssd": safe_float(metrics.get("rmssd")),
        "sdnn": safe_float(metrics.get("sdnn")),
        "pnn50": safe_float(metrics.get("pnn50")),
        "lfHf": safe_float(metrics.get("lf_hf")),
        "ecg": ecg_samples if ecg_samples else None,
        "ecgSampleRateHz": safe_float(packet.get("sampleRateHz")),
        "sequence": safe_int(packet.get("seq")),
        "source": source,
        "device": device,
        "driverTimestamp": driver_timestamp,
        "bridgeReceivedAt": bridge_received_at,
        "collectedAtSource": collected_at_source,
    }

    if rr_ms is not None:
        payload["ibiMs"] = [rr_ms]

    if include_raw_packet:
        payload["rawPacket"] = packet

    return MessageEnvelope(
        type=MessageType.PUBLISH,
        topic=Topic.HRV_RAW,
        clientId=client_id,
        requiresAck=False,
        collectedAt=collected_at,
        sessionTimeMs=int((time.time() - start_time) * 1000),
        payload=compact(payload),
    )


def make_recording_command(
    *,
    action: str,
    run_id: str | None,
    label: str | None,
    reason: str | None,
    source: str | None,
) -> JsonDict:
    return compact(
        {
            "type": "recording",
            "action": action,
            "runId": run_id,
            "label": label,
            "reason": reason,
            "source": source or "hub",
            "timestamp": utc_now_iso(),
        }
    )


async def send_recording_command(
    *,
    polar_control_ws: str,
    action: str,
    run_id: str | None,
    label: str | None,
    reason: str | None,
    source: str | None,
) -> None:
    command = make_recording_command(
        action=action,
        run_id=run_id,
        label=label,
        reason=reason,
        source=source,
    )

    async with websockets.connect(polar_control_ws) as ws:
        await ws.send(json.dumps(command))

        try:
            response = await asyncio.wait_for(ws.recv(), timeout=2.0)
            print(f"[polarh10] control response: {response}")
        except TimeoutError:
            print("[polarh10] control command sent; no response received")

    print(f"[polarh10] sent recording command: {command}")


async def publish_polar_stream(
    *,
    polar_ws: str,
    hub_ws: str,
    client_id: str,
    source: str,
    device: str,
    include_raw_packet: bool,
) -> None:
    start_time = time.time()
    reconnect_delay = POLAR_RECONNECT_INITIAL_SECONDS

    while True:
        try:
            async with websockets.connect(hub_ws) as hub:
                await hub.send(make_hello(client_id).model_dump_json())
                print(f"[polarh10] telemetry connected to hub: {hub_ws}")

                async with websockets.connect(polar_ws) as polar:
                    print(f"[polarh10] connected to Polar stream: {polar_ws}")
                    reconnect_delay = POLAR_RECONNECT_INITIAL_SECONDS

                    async for message in polar:
                        bridge_received_at = utc_now_iso()
                        try:
                            packet = json.loads(message)
                        except (TypeError, ValueError) as exc:
                            # A malformed packet must not tear down an
                            # otherwise healthy stream and trigger reconnect.
                            print(f"[polarh10] ignored invalid Polar packet: {exc}")
                            continue

                        if not isinstance(packet, dict):
                            print("[polarh10] ignored non-object Polar message")
                            continue

                        envelope = convert_polar_packet(
                            packet,
                            client_id=client_id,
                            source=source,
                            device=device,
                            start_time=start_time,
                            include_raw_packet=include_raw_packet,
                            bridge_received_at=bridge_received_at,
                        )

                        await hub.send(envelope.model_dump_json())

                        payload = envelope.payload
                        print(
                            "[polarh10] "
                            f"seq={payload.get('sequence')} "
                            f"bpm={payload.get('bpm')} "
                            f"rrMs={payload.get('rrMs')} "
                            f"ecg_samples={len(payload.get('ecg') or [])} "
                            "-> hrv.raw"
                        )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(
                f"[polarh10] stream disconnected: {exc}; "
                f"retrying in {reconnect_delay:g}s"
            )

        await asyncio.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, POLAR_RECONNECT_MAX_SECONDS)

async def listen_lifecycle(
    *,
    hub_ws: str,
    client_id: str,
    polar_control_ws: str,
    enable_recording_control: bool,
) -> None:
    lifecycle_client_id = f"{client_id}-lifecycle"
    reconnect_delay = POLAR_RECONNECT_INITIAL_SECONDS

    while True:
        try:
            async with websockets.connect(hub_ws) as hub:
                await hub.send(make_hello(lifecycle_client_id).model_dump_json())
                await hub.send(
                    make_subscribe(
                        lifecycle_client_id,
                        [Topic.EXPERIENCE_LIFECYCLE],
                    ).model_dump_json()
                )

                reconnect_delay = POLAR_RECONNECT_INITIAL_SECONDS
                print(f"[polarh10] lifecycle connected to hub: {hub_ws}")
                print("[polarh10] subscribed to: experience.lifecycle")

                async for message in hub:
                    try:
                        envelope = MessageEnvelope.model_validate_json(message)
                    except Exception as exc:
                        print(f"[polarh10] failed to parse lifecycle message: {exc}")
                        continue

                    topic_value = None
                    if envelope.topic is not None:
                        topic_value = envelope.topic.value if hasattr(envelope.topic, "value") else str(envelope.topic)

                    if envelope.type != MessageType.PUBLISH or topic_value != Topic.EXPERIENCE_LIFECYCLE.value:
                        continue

                    payload = envelope.payload or {}
                    event = payload.get("event")
                    run_id = payload.get("runId")
                    label = payload.get("label")
                    reason = payload.get("reason")
                    source = payload.get("source")

                    if event not in {"started", "ended"}:
                        print(f"[polarh10] ignored unsupported lifecycle event={event}")
                        continue

                    if not enable_recording_control:
                        print(f"[polarh10] recording control disabled; {event} not forwarded")
                        continue

                    # A control failure belongs to this lifecycle event. It must
                    # not take down the lifecycle subscription or telemetry task.
                    try:
                        await send_recording_command(
                            polar_control_ws=polar_control_ws,
                            action="start" if event == "started" else "stop",
                            run_id=run_id,
                            label=label,
                            reason=reason,
                            source=source,
                        )
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:
                        print(
                            f"[polarh10] recording control failed for {event} "
                            f"runId={run_id}: {exc}; event will not be retried automatically"
                        )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(
                f"[polarh10] lifecycle disconnected: {exc}; "
                f"retrying in {reconnect_delay:g}s"
            )

        # Reconnect after both errors and normal websocket closure. A lifecycle
        # event is never replayed, so recording commands are not duplicated.
        await asyncio.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, POLAR_RECONNECT_MAX_SECONDS)

async def run_client(
    *,
    polar_ws: str,
    polar_control_ws: str,
    hub_ws: str,
    client_id: str,
    source: str,
    device: str,
    include_raw_packet: bool,
    enable_recording_control: bool,
) -> None:
    await asyncio.gather(
        publish_polar_stream(
            polar_ws=polar_ws,
            hub_ws=hub_ws,
            client_id=client_id,
            source=source,
            device=device,
            include_raw_packet=include_raw_packet,
        ),
        listen_lifecycle(
            hub_ws=hub_ws,
            client_id=client_id,
            polar_control_ws=polar_control_ws,
            enable_recording_control=enable_recording_control,
        ),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Publish Polar H10 telemetry to the Biofeedback Hub and forward "
            "experience.lifecycle events to the Polar recording control endpoint."
        )
    )

    parser.add_argument("--polar-ws", default=DEFAULT_POLAR_WS)
    parser.add_argument("--polar-control-ws", default=DEFAULT_POLAR_CONTROL_WS)
    parser.add_argument("--hub-ws", default=DEFAULT_HUB_WS)
    parser.add_argument("--client-id", default=DEFAULT_CLIENT_ID)
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--device", default=DEFAULT_DEVICE)
    parser.add_argument("--include-raw-packet", action="store_true")
    parser.add_argument("--disable-recording-control", action="store_true")

    return parser


async def async_main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)

    await run_client(
        polar_ws=args.polar_ws,
        polar_control_ws=args.polar_control_ws,
        hub_ws=args.hub_ws,
        client_id=args.client_id,
        source=args.source,
        device=args.device,
        include_raw_packet=args.include_raw_packet,
        enable_recording_control=not args.disable_recording_control,
    )


def run() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    run()
