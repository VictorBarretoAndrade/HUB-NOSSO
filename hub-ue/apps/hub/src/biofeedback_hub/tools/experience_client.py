from __future__ import annotations

import argparse
import asyncio

import websockets

from biofeedback_hub.schemas.envelope import (
    ClientHello,
    ClientRole,
    MessageEnvelope,
    MessageType,
)
from biofeedback_hub.schemas.topics import Topic


DEFAULT_HUB_WS = "ws://127.0.0.1:8787/ws"
DEFAULT_CLIENT_ID = "experience-cli"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hub-ws", default=DEFAULT_HUB_WS)
    parser.add_argument("--client-id", default=DEFAULT_CLIENT_ID)
    parser.add_argument("--hold-seconds", type=float, default=2.0)

    subparsers = parser.add_subparsers(dest="command", required=True)

    start = subparsers.add_parser("start")
    start.add_argument("--run-id", required=True)
    start.add_argument("--label", default="manual-start")
    start.add_argument("--reason", default="operator")

    end = subparsers.add_parser("end")
    end.add_argument("--run-id", required=True)
    end.add_argument("--reason", default="operator")

    marker = subparsers.add_parser("marker")
    marker.add_argument("--label", required=True)
    marker.add_argument("--note", default="")
    marker.add_argument("--reason", default="operator")

    return parser


def make_hello(client_id: str) -> MessageEnvelope:
    return MessageEnvelope(
        type=MessageType.HELLO,
        clientId=client_id,
        payload=ClientHello(
            clientId=client_id,
            role=ClientRole.CONTROLLER,
            capabilities=["experience-control"],
        ).model_dump(mode="json"),
    )


def make_publish(client_id: str, topic: Topic, payload: dict) -> MessageEnvelope:
    return MessageEnvelope(
        type=MessageType.PUBLISH,
        clientId=client_id,
        topic=topic,
        requiresAck=False,
        payload=payload,
    )


async def publish(args: argparse.Namespace) -> None:
    async with websockets.connect(args.hub_ws) as ws:
        await ws.send(make_hello(args.client_id).model_dump_json())

        if args.command == "start":
            message = make_publish(
                args.client_id,
                Topic.EXPERIENCE_LIFECYCLE,
                {
                    "event": "started",
                    "runId": args.run_id,
                    "label": args.label,
                    "source": "cli",
                    "reason": args.reason,
                },
            )

        elif args.command == "end":
            message = make_publish(
                args.client_id,
                Topic.EXPERIENCE_LIFECYCLE,
                {
                    "event": "ended",
                    "runId": args.run_id,
                    "source": "cli",
                    "reason": args.reason,
                },
            )

        elif args.command == "marker":
            message = make_publish(
                args.client_id,
                Topic.EXPERIENCE_MARKER,
                {
                    "label": args.label,
                    "note": args.note,
                    "source": "cli",
                    "reason": args.reason,
                },
            )

        else:
            raise ValueError(f"Unsupported command: {args.command}")

        await ws.send(message.model_dump_json())
        print(f"[experience] published {message.topic}: {message.payload}")

        await asyncio.sleep(args.hold_seconds)


def main() -> None:
    args = build_parser().parse_args()
    asyncio.run(publish(args))


if __name__ == "__main__":
    main()