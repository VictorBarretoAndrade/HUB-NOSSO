from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen


@dataclass(frozen=True)
class EndpointUrls:
    base_url: str
    health_url: str
    status_url: str


def main() -> None:
    parser = argparse.ArgumentParser(description="Run local diagnostics for the biofeedback hub.")
    parser.add_argument("--url", default="http://127.0.0.1:8787", help="Hub HTTP or WebSocket URL.")
    args = parser.parse_args()

    try:
        print(run_doctor(args.url))
    except URLError as exc:
        print(format_offline_report(args.url, exc))


def run_doctor(url: str) -> str:
    endpoints = build_endpoint_urls(url)
    health = read_json(endpoints.health_url)
    status = read_json(endpoints.status_url)
    return format_report(health=health, status=status)


def build_endpoint_urls(url: str) -> EndpointUrls:
    base = url.strip().rstrip("/")
    if base.startswith("ws://"):
        base = "http://" + base[5:]
    elif base.startswith("wss://"):
        base = "https://" + base[6:]

    if base.endswith("/ws"):
        base = base[:-3]

    return EndpointUrls(
        base_url=base,
        health_url=f"{base}/health",
        status_url=f"{base}/status",
    )


def read_json(url: str) -> dict[str, Any]:
    with urlopen(url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def format_report(health: dict[str, Any], status: dict[str, Any]) -> str:
    clients = status.get("clients") or []
    unreal_command_clients = [
        client for client in clients if "unreal.commands" in (client.get("subscriptions") or [])
    ]
    pending_acks = status.get("pendingAcks") or []

    lines = [
        "Biofeedback Doctor",
        f"Hub: {'online' if health.get('ok') else 'unhealthy'}",
        f"Service: {health.get('service', status.get('service', 'unknown'))}",
        f"Session: {health.get('sessionId', status.get('sessionId', 'unknown'))}",
        f"Clients: {status.get('clientCount', len(clients))}",
        f"Unreal command subscribers: {len(unreal_command_clients)}",
        f"Pending ACKs: {status.get('pendingAckCount', len(pending_acks))}",
        "",
        "Unreal command clients",
    ]

    if unreal_command_clients:
        for client in unreal_command_clients:
            lines.append(f"- {client.get('clientId')} [{client.get('role', 'unknown')}]")
        lines.extend(["", "Ready for unreal.commands ACK test."])
    else:
        lines.extend(
            [
                "- none",
                "",
                "No client is subscribed to unreal.commands.",
                "Start the Unreal project, then run biofeedback-status or biofeedback-doctor again.",
            ]
        )

    if pending_acks:
        lines.extend(["", "Pending ACK details"])
        for ack in pending_acks:
            lines.append(
                f"- {ack.get('messageId')} publisher={ack.get('publisherClientId')} recipient={ack.get('recipientClientId')}"
            )

    return "\n".join(lines)


def format_offline_report(url: str, exc: BaseException) -> str:
    endpoints = build_endpoint_urls(url)
    return "\n".join(
        [
            "Biofeedback Doctor",
            "Hub: offline",
            f"URL: {endpoints.base_url}",
            f"Error: {exc}",
            "",
            "Start the hub from the repository root:",
            ".\\.venv\\Scripts\\biofeedback-hub",
        ]
    )


if __name__ == "__main__":
    main()
