from __future__ import annotations

import argparse
import asyncio
import json
from urllib.parse import quote

from biofeedback_hub.schemas.envelope import ClientHello, ClientRole, MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish a critical command to Unreal clients.")
    parser.add_argument("--url", default="ws://127.0.0.1:8787/ws")
    parser.add_argument("--token", default=None)
    parser.add_argument("--client-id", default="controller-cli")
    parser.add_argument("--action", required=True)
    parser.add_argument("--arg", action="append", default=[], help="Command argument as key=value. Can be repeated.")
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()

    arguments = parse_arguments(args.arg)
    asyncio.run(
        publish_command(
            url=args.url,
            token=args.token,
            client_id=args.client_id,
            action=args.action,
            arguments=arguments,
            timeout_seconds=args.timeout,
        )
    )


def build_command_message(
    client_id: str,
    action: str,
    arguments: dict[str, str] | None = None,
) -> MessageEnvelope:
    return MessageEnvelope(
        type=MessageType.PUBLISH,
        clientId=client_id,
        topic=Topic.UNREAL_COMMANDS,
        requiresAck=True,
        payload={
            "action": action,
            "target": "single",
            "arguments": arguments or {},
        },
    )


def build_connect_url(url: str, token: str | None) -> str:
    if not token:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}token={quote(token)}"


def parse_arguments(entries: list[str]) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for entry in entries:
        if "=" not in entry:
            raise ValueError(f"Argument must be key=value: {entry}")
        key, value = entry.split("=", 1)
        key = key.strip()
        if not key:
            raise ValueError(f"Argument key cannot be empty: {entry}")
        parsed[key] = value
    return parsed


async def publish_command(
    url: str,
    token: str | None,
    client_id: str,
    action: str,
    arguments: dict[str, str] | None = None,
    timeout_seconds: float = 5.0,
) -> MessageEnvelope | None:
    try:
        import websockets
    except ImportError as exc:
        raise RuntimeError("Install hub dependencies with: python -m pip install -e apps/hub") from exc

    async with websockets.connect(build_connect_url(url, token)) as socket:
        await socket.send(
            MessageEnvelope(
                type=MessageType.HELLO,
                clientId=client_id,
                payload=ClientHello(
                    clientId=client_id,
                    role=ClientRole.CONTROLLER,
                    capabilities=["commands"],
                ).model_dump(mode="json"),
            ).model_dump_json()
        )

        command = build_command_message(client_id=client_id, action=action, arguments=arguments)
        await socket.send(command.model_dump_json())
        print(command.model_dump_json())

        try:
            raw_ack = await asyncio.wait_for(socket.recv(), timeout=timeout_seconds)
        except TimeoutError:
            print(f"No ACK received within {timeout_seconds:g}s.")
            return None

        ack = MessageEnvelope.model_validate_json(raw_ack)
        print(json.dumps(ack.model_dump(mode="json"), separators=(",", ":")))
        return ack


if __name__ == "__main__":
    main()
