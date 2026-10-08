from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from biofeedback_hub.schemas.envelope import MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic
from biofeedback_hub.tools import polarh10_client
from biofeedback_hub.tools.polarh10_client import convert_polar_packet


class PolarH10BridgeTest(unittest.TestCase):
    def test_driver_timestamp_and_bridge_receipt_are_preserved(self) -> None:
        envelope = convert_polar_packet(
            {
                "timestamp": 1_735_689_600.25,
                "seq": 42,
                "samples": [0.1, 0.2],
                "sampleRateHz": 130,
                "metrics": {"hr": 72, "rr": 0.833},
            },
            client_id="polar-h10",
            source="polar-h10-driver",
            device="polar-h10",
            start_time=1_735_689_590.0,
            include_raw_packet=False,
            bridge_received_at="2026-08-25T12:00:01.000000Z",
        )

        self.assertEqual(envelope.collectedAt, "2025-01-01T00:00:00.250000Z")
        self.assertEqual(envelope.payload["driverTimestamp"], 1_735_689_600.25)
        self.assertEqual(envelope.payload["bridgeReceivedAt"], "2026-08-25T12:00:01.000000Z")
        self.assertEqual(envelope.payload["collectedAtSource"], "driver-packet-timestamp")
        self.assertEqual(envelope.payload["sequence"], 42)
        self.assertEqual(envelope.payload["ecg"], [0.1, 0.2])

    def test_invalid_driver_timestamp_uses_bridge_receipt_fallback(self) -> None:
        envelope = convert_polar_packet(
            {"timestamp": "not-a-timestamp", "seq": 7, "metrics": {}},
            client_id="polar-h10",
            source="polar-h10-driver",
            device="polar-h10",
            start_time=0.0,
            include_raw_packet=False,
            bridge_received_at="2026-08-25T12:00:01.000000Z",
        )

        self.assertEqual(envelope.collectedAt, "2026-08-25T12:00:01.000000Z")
        self.assertEqual(envelope.payload["bridgeReceivedAt"], "2026-08-25T12:00:01.000000Z")
        self.assertEqual(envelope.payload["collectedAtSource"], "bridge-receipt-fallback")
        self.assertNotIn("driverTimestamp", envelope.payload)


class PolarH10LifecycleReconnectTest(unittest.IsolatedAsyncioTestCase):
    async def test_lifecycle_reconnects_after_normal_close_and_control_failure(self) -> None:
        lifecycle_message = MessageEnvelope(
            type=MessageType.PUBLISH,
            clientId="hub",
            topic=Topic.EXPERIENCE_LIFECYCLE,
            payload={"event": "started", "runId": "run-1"},
        ).model_dump_json()

        class FakeHub:
            def __init__(self, messages: list[str]) -> None:
                self.messages = messages
                self.sent: list[str] = []

            async def __aenter__(self) -> "FakeHub":
                return self

            async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
                return None

            def __aiter__(self) -> "FakeHub":
                return self

            async def __anext__(self) -> str:
                if self.messages:
                    return self.messages.pop(0)
                raise StopAsyncIteration

            async def send(self, payload: str) -> None:
                self.sent.append(payload)

        hubs = [FakeHub([lifecycle_message]), FakeHub([])]
        connect_calls: list[str] = []

        def fake_connect(url: str) -> FakeHub:
            connect_calls.append(url)
            if "control" in url:
                raise OSError("control endpoint unavailable")
            return hubs.pop(0)

        sleep_calls: list[float] = []

        async def stop_after_second_reconnect(delay: float) -> None:
            sleep_calls.append(delay)
            if len(sleep_calls) == 2:
                raise asyncio.CancelledError

        with patch.object(polarh10_client.websockets, "connect", side_effect=fake_connect):
            with patch.object(polarh10_client.asyncio, "sleep", side_effect=stop_after_second_reconnect):
                with self.assertRaises(asyncio.CancelledError):
                    await polarh10_client.listen_lifecycle(
                        hub_ws="ws://hub/ws",
                        client_id="polar-h10",
                        polar_control_ws="ws://control/control",
                        enable_recording_control=True,
                    )

        self.assertEqual(connect_calls, ["ws://hub/ws", "ws://control/control", "ws://hub/ws"])
        self.assertEqual(sleep_calls, [1.0, 1.0])
        self.assertEqual(len(hubs), 0)

    async def test_lifecycle_reconnects_when_hub_is_initially_unavailable(self) -> None:
        hub = type(
            "Hub",
            (),
            {
                "__aenter__": lambda self: _return_self(self),
                "__aexit__": lambda self, exc_type, exc, tb: _return_none(),
                "__aiter__": lambda self: self,
                "__anext__": lambda self: _stop_iteration(),
                "send": lambda self, payload: _return_none(),
            },
        )()
        attempts = 0

        def fake_connect(url: str):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise OSError("hub unavailable")
            return hub

        sleep_calls = 0

        async def stop_after_retry(delay: float) -> None:
            nonlocal sleep_calls
            sleep_calls += 1
            if sleep_calls > 1:
                raise asyncio.CancelledError

        with patch.object(polarh10_client.websockets, "connect", side_effect=fake_connect):
            with patch.object(polarh10_client.asyncio, "sleep", side_effect=stop_after_retry):
                with self.assertRaises(asyncio.CancelledError):
                    await polarh10_client.listen_lifecycle(
                        hub_ws="ws://hub/ws",
                        client_id="polar-h10",
                        polar_control_ws="ws://control/control",
                        enable_recording_control=False,
                    )

        self.assertEqual(attempts, 2)


async def _return_self(value: object) -> object:
    return value


async def _return_none() -> None:
    return None


async def _stop_iteration() -> str:
    raise StopAsyncIteration


if __name__ == "__main__":
    unittest.main()
