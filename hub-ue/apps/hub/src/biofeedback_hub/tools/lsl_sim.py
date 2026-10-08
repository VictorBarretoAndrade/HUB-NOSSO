from __future__ import annotations

import argparse
import importlib
import math
import time
from typing import Any


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Publish a numeric LSL stream for Hub validation.")
    parser.add_argument("--name", default="Biofeedback Hub Test")
    parser.add_argument("--type", dest="stream_type", default="TestSignal")
    parser.add_argument("--source-id", default="biofeedback-hub-lsl-sim")
    parser.add_argument("--rate", type=float, default=10.0, help="Samples per second.")
    parser.add_argument(
        "--duration",
        type=float,
        default=0.0,
        help="Seconds to run; zero keeps the outlet running until Ctrl+C.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.rate <= 0:
        raise SystemExit("--rate must be greater than zero")
    if args.duration < 0:
        raise SystemExit("--duration must be zero or greater")

    try:
        pylsl = importlib.import_module("pylsl")
    except Exception as exc:
        raise SystemExit(
            "LSL simulator unavailable. Install it with: "
            "python -m pip install -e \"apps/hub[lsl]\" "
            f"({exc})"
        ) from exc

    info = build_stream_info(pylsl, args)
    outlet = pylsl.StreamOutlet(info)
    print(
        f"LSL outlet ready: {args.name} ({args.stream_type}), "
        f"2 channels at {args.rate:g} Hz. Press Ctrl+C to stop."
    )

    interval = 1.0 / args.rate
    started = time.monotonic()
    deadline = started + args.duration if args.duration else None
    sequence = 0
    try:
        while deadline is None or time.monotonic() < deadline:
            target = started + sequence * interval
            delay = target - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            elapsed = time.monotonic() - started
            outlet.push_sample(make_sample(elapsed), timestamp=pylsl.local_clock())
            sequence += 1
    except KeyboardInterrupt:
        pass


def build_stream_info(pylsl: Any, args: argparse.Namespace) -> Any:
    info = pylsl.StreamInfo(
        args.name,
        args.stream_type,
        2,
        args.rate,
        pylsl.cf_float32,
        args.source_id,
    )
    channels = info.desc().append_child("channels")
    for label, unit in (("signal_a", "a.u."), ("signal_b", "a.u.")):
        channel = channels.append_child("channel")
        channel.append_child_value("label", label)
        channel.append_child_value("unit", unit)
        channel.append_child_value("type", "synthetic")
    info.desc().append_child_value("manufacturer", "Biofeedback Hub")
    return info


def make_sample(elapsed_seconds: float) -> list[float]:
    return [
        math.sin(elapsed_seconds * math.tau),
        math.cos(elapsed_seconds * math.tau * 0.5),
    ]


if __name__ == "__main__":
    main()
