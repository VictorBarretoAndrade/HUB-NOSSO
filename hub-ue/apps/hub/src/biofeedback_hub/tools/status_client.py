from __future__ import annotations

import argparse
import json
from typing import Any
from urllib.request import urlopen


def main() -> None:
    parser = argparse.ArgumentParser(description="Show connected biofeedback hub clients and pending ACKs.")
    parser.add_argument("--url", default="http://127.0.0.1:8787")
    parser.add_argument("--json", action="store_true", help="Print raw JSON.")
    args = parser.parse_args()

    status_url = build_status_url(args.url)
    with urlopen(status_url, timeout=5) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(format_status(payload))


def build_status_url(url: str) -> str:
    base = url.strip().rstrip("/")
    if base.startswith("ws://"):
        base = "http://" + base[5:]
    elif base.startswith("wss://"):
        base = "https://" + base[6:]

    if base.endswith("/ws"):
        base = base[:-3]

    return f"{base}/status"


def format_status(payload: dict[str, Any]) -> str:
    lines = [
        f"Biofeedback Hub: {payload.get('service', 'unknown')}",
        f"Session: {payload.get('sessionId', 'unknown')}",
        f"Clients: {payload.get('clientCount', 0)}",
        f"Pending ACKs: {payload.get('pendingAckCount', 0)}",
        "",
        "Clients",
    ]

    clients = payload.get("clients") or []
    if clients:
        for client in clients:
            capabilities = ", ".join(client.get("capabilities") or []) or "-"
            subscriptions = ", ".join(client.get("subscriptions") or []) or "-"
            lines.append(
                f"- {client.get('clientId')} [{client.get('role')}] caps={capabilities} subs={subscriptions} outbox={client.get('outboxSize', 0)}"
            )
    else:
        lines.append("- none")

    lines.extend(["", "Sensor Manager"])
    sensor_manager = payload.get("sensorManager") or {}
    sensors = sensor_manager.get("sensors") if isinstance(sensor_manager, dict) else []
    if sensors:
        lines.append(
            f"- sensors={sensor_manager.get('sensorCount', len(sensors))} adapters={sensor_manager.get('adapterCount', 0)} recording={sensor_manager.get('recordingCount', 0)}"
        )
        for sensor in sensors:
            topics = ", ".join(sensor.get("topics") or []) or "-"
            lines.append(
                f"  - {sensor.get('sensorId')} [{sensor.get('state')}] adapter={sensor.get('adapterId')} topics={topics}"
            )
    else:
        lines.append("- none")

    lines.extend(["", "Pending ACKs"])
    pending_acks = payload.get("pendingAcks") or []
    if pending_acks:
        for ack in pending_acks:
            lines.append(
                f"- {ack.get('messageId')} publisher={ack.get('publisherClientId')} recipient={ack.get('recipientClientId')}"
            )
    else:
        lines.append("- none")

    return "\n".join(lines)


if __name__ == "__main__":
    main()
