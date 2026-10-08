import asyncio
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

from biofeedback_hub.config import HubConfig
from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.main import create_app
from biofeedback_hub.schemas.envelope import MessageEnvelope, MessageType
from biofeedback_hub.schemas.topics import Topic


class JsonlSessionLoggerTest(unittest.TestCase):
    def test_appends_message_with_hub_received_timestamp(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = JsonlSessionLogger(Path(tmpdir), session_id="session-test")
            message = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="hrv-sim",
                topic=Topic.HRV_RAW,
                payload={"bpm": 72},
            )

            path = logger.append(message)

            lines = path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 1)
            record = json.loads(lines[0])
            self.assertEqual(record["topic"], "hrv.raw")
            self.assertEqual(record["payload"], {"bpm": 72})
            self.assertIsNotNone(record["hubReceivedAt"])


class AsyncJsonlSessionLoggerTest(unittest.IsolatedAsyncioTestCase):
    async def test_health_reports_background_log_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            app = create_app(
                HubConfig(
                    log_dir=Path(tmpdir),
                    session_id="session-test",
                    cors_origins=[],
                    lsl_enabled=False,
                )
            )
            app.state.session_logger._write_error = OSError("disk unavailable")
            health_route = next(route for route in app.routes if getattr(route, "path", None) == "/health")
            status_route = next(route for route in app.routes if getattr(route, "path", None) == "/status")

            health = await health_route.endpoint()
            status = await status_route.endpoint()

            self.assertFalse(health["ok"])
            self.assertEqual(health["sessionLogError"], "disk unavailable")
            self.assertFalse(status["ok"])
            self.assertEqual(status["sessionLog"]["error"], "disk unavailable")

    async def test_background_queue_returns_before_slow_disk_and_preserves_order(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            release_write = threading.Event()
            write_started = threading.Event()

            class SlowLogger(JsonlSessionLogger):
                def append(self, message: MessageEnvelope) -> Path:
                    write_started.set()
                    release_write.wait(timeout=1)
                    return super().append(message)

            logger = SlowLogger(
                Path(tmpdir),
                session_id="session-test",
                background_writes=True,
            )
            first = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="unreal-test",
                topic=Topic.UNREAL_STATE,
                payload={"sequence": 1},
            )
            second = first.model_copy(update={"id": "queued-second", "payload": {"sequence": 2}})

            started = time.monotonic()
            await logger.enqueue_async(first)
            await logger.enqueue_async(second)
            self.assertLess(time.monotonic() - started, 0.1)
            await asyncio.wait_for(asyncio.to_thread(write_started.wait), timeout=1)
            self.assertEqual(logger.snapshot()["pendingWrites"], 2)

            release_write.set()
            await logger.flush_async()

            records = [json.loads(line) for line in logger.path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual([record["payload"]["sequence"] for record in records], [1, 2])
            self.assertEqual(logger.snapshot()["pendingWrites"], 0)

    async def test_slow_append_does_not_block_event_loop(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            release_write = threading.Event()

            class SlowLogger(JsonlSessionLogger):
                def append(self, message: MessageEnvelope) -> Path:
                    release_write.wait(timeout=1)
                    return super().append(message)

            logger = SlowLogger(Path(tmpdir), session_id="session-test")
            message = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="hrv-sim",
                topic=Topic.HRV_RAW,
                payload={"bpm": 72},
            )

            async def release_on_next_tick() -> None:
                await asyncio.sleep(0.01)
                release_write.set()

            started = time.monotonic()
            await asyncio.gather(logger.append_async(message), release_on_next_tick())

            self.assertLess(time.monotonic() - started, 0.5)
            self.assertTrue(logger.path.exists())

    async def test_cancellation_while_waiting_for_lock_still_persists_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            first_write_started = threading.Event()
            release_first_write = threading.Event()

            class BlockingFirstLogger(JsonlSessionLogger):
                def __init__(self, root_dir: Path, session_id: str) -> None:
                    super().__init__(root_dir, session_id)
                    self.write_count = 0

                def append(self, message: MessageEnvelope) -> Path:
                    self.write_count += 1
                    if self.write_count == 1:
                        first_write_started.set()
                        release_first_write.wait(timeout=1)
                    return super().append(message)

            logger = BlockingFirstLogger(Path(tmpdir), session_id="session-test")
            first = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="sensor-a",
                topic=Topic.HRV_RAW,
                payload={"sequence": 1},
            )
            second = first.model_copy(update={"id": "second-message", "payload": {"sequence": 2}})

            first_task = asyncio.create_task(logger.append_async(first))
            while not first_write_started.is_set():
                await asyncio.sleep(0)
            second_task = asyncio.create_task(logger.append_async(second))
            await asyncio.sleep(0)
            second_task.cancel()
            release_first_write.set()

            await first_task
            with self.assertRaises(asyncio.CancelledError):
                await second_task

            records = [json.loads(line) for line in logger.path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual([record["payload"]["sequence"] for record in records], [1, 2])

    async def test_repeated_cancellation_cannot_cancel_active_disk_write(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            write_started = threading.Event()
            release_write = threading.Event()

            class BlockingLogger(JsonlSessionLogger):
                def append(self, message: MessageEnvelope) -> Path:
                    write_started.set()
                    release_write.wait(timeout=1)
                    return super().append(message)

            logger = BlockingLogger(Path(tmpdir), session_id="session-test")
            message = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="sensor-a",
                topic=Topic.HRV_RAW,
                payload={"sequence": 1},
            )
            task = asyncio.create_task(logger.append_async(message))
            await asyncio.wait_for(asyncio.to_thread(write_started.wait), timeout=1)

            task.cancel()
            await asyncio.sleep(0)
            task.cancel()
            release_write.set()

            with self.assertRaises(asyncio.CancelledError):
                await task
            records = logger.path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(records), 1)

    async def test_background_write_failure_is_reported_by_flush_and_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            class FailingLogger(JsonlSessionLogger):
                def append(self, message: MessageEnvelope) -> Path:
                    raise OSError("disk unavailable")

            logger = FailingLogger(
                Path(tmpdir),
                session_id="session-test",
                background_writes=True,
            )
            message = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="sensor-a",
                topic=Topic.HRV_RAW,
                payload={"sequence": 1},
            )

            await logger.enqueue_async(message)
            with self.assertRaisesRegex(RuntimeError, "background JSONL write failed"):
                await logger.flush_async()
            self.assertIn("disk unavailable", str(logger.snapshot()["error"]))
            with self.assertRaisesRegex(RuntimeError, "background JSONL write failed"):
                await logger.enqueue_async(message)

    async def test_all_producers_waiting_for_capacity_fail_when_writer_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            write_started = threading.Event()
            release_write = threading.Event()

            class FailingAfterStartLogger(JsonlSessionLogger):
                def append(self, message: MessageEnvelope) -> Path:
                    write_started.set()
                    release_write.wait(timeout=1)
                    raise OSError("disk unavailable")

            logger = FailingAfterStartLogger(
                Path(tmpdir),
                session_id="session-test",
                max_pending_writes=1,
                background_writes=True,
            )
            first = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="sensor-a",
                topic=Topic.HRV_RAW,
                payload={"sequence": 1},
            )
            second = first.model_copy(update={"id": "second", "payload": {"sequence": 2}})
            third = first.model_copy(update={"id": "third", "payload": {"sequence": 3}})
            fourth = first.model_copy(update={"id": "fourth", "payload": {"sequence": 4}})

            await logger.enqueue_async(first)
            await asyncio.wait_for(asyncio.to_thread(write_started.wait), timeout=1)
            await logger.enqueue_async(second)
            waiting = asyncio.gather(
                logger.enqueue_async(third),
                logger.enqueue_async(fourth),
                return_exceptions=True,
            )
            await asyncio.sleep(0)
            self.assertFalse(waiting.done())

            release_write.set()
            results = await waiting

            self.assertTrue(all(isinstance(result, RuntimeError) for result in results))
            self.assertFalse(logger.path.exists())
            self.assertIn("disk unavailable", str(logger.snapshot()["error"]))

    async def test_repeated_cancellation_of_flush_waits_for_disk_write(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            write_started = threading.Event()
            release_write = threading.Event()

            class BlockingLogger(JsonlSessionLogger):
                def append(self, message: MessageEnvelope) -> Path:
                    write_started.set()
                    release_write.wait(timeout=1)
                    return super().append(message)

            logger = BlockingLogger(
                Path(tmpdir),
                session_id="session-test",
                background_writes=True,
            )
            message = MessageEnvelope(
                type=MessageType.PUBLISH,
                clientId="sensor-a",
                topic=Topic.HRV_RAW,
                payload={"sequence": 1},
            )
            await logger.enqueue_async(message)
            await asyncio.wait_for(asyncio.to_thread(write_started.wait), timeout=1)
            flush_task = asyncio.create_task(logger.flush_async())
            await asyncio.sleep(0)

            flush_task.cancel()
            await asyncio.sleep(0)
            flush_task.cancel()
            self.assertFalse(flush_task.done())
            release_write.set()

            with self.assertRaises(asyncio.CancelledError):
                await flush_task
            self.assertEqual(len(logger.path.read_text(encoding="utf-8").splitlines()), 1)
            self.assertEqual(logger.snapshot()["pendingWrites"], 0)


if __name__ == "__main__":
    unittest.main()
