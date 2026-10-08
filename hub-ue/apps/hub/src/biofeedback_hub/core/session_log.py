from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.envelope import MessageEnvelope


@dataclass
class _PendingWrite:
    message: MessageEnvelope
    completion: asyncio.Future[Path] | None = None


class JsonlSessionLogger:
    """Append-only JSONL logger with one bounded background writer."""

    def __init__(
        self,
        root_dir: Path,
        session_id: str,
        max_pending_writes: int = 4096,
        *,
        background_writes: bool = False,
    ) -> None:
        if max_pending_writes <= 0:
            raise ValueError("max_pending_writes must be greater than zero")
        self.root_dir = root_dir
        self.session_id = session_id
        self.max_pending_writes = max_pending_writes
        self.background_writes = background_writes
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.root_dir / f"{session_id}.jsonl"
        self._async_lock = asyncio.Lock()
        self._pending_messages: asyncio.Queue[_PendingWrite] = asyncio.Queue(
            maxsize=max_pending_writes
        )
        # Producers wait on this condition instead of Queue.put() so a terminal
        # writer failure can wake every producer that is waiting for capacity.
        self._queue_condition = asyncio.Condition()
        self._writer_task: asyncio.Task[None] | None = None
        self._write_error: BaseException | None = None
        self._in_flight_writes = 0

    def append(self, message: MessageEnvelope) -> Path:
        if message.hubReceivedAt is None:
            message = message.model_copy(update={"hubReceivedAt": utc_now_iso()})

        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(message.model_dump_json() + "\n")
        return self.path

    async def append_async(self, message: MessageEnvelope) -> Path:
        write_task = asyncio.create_task(self._append_serialized(message))
        try:
            return await asyncio.shield(write_task)
        except asyncio.CancelledError as cancellation:
            while not write_task.done():
                try:
                    await asyncio.shield(write_task)
                except asyncio.CancelledError:
                    continue
            write_task.result()
            raise cancellation

    async def enqueue_async(self, message: MessageEnvelope) -> Path:
        if not self.background_writes:
            return await self.append_async(message)
        await self._enqueue_background(_PendingWrite(message=message))
        return self.path

    async def persist_async(self, message: MessageEnvelope) -> Path:
        """Persist a message before the runtime distributes it.

        ``enqueue_async`` intentionally acknowledges queue admission so callers
        that only need asynchronous buffering can keep producing. Runtime
        events use this method when publication must not outrun the official
        JSONL record.
        """
        if not self.background_writes:
            return await self.append_async(message)

        completion = asyncio.get_running_loop().create_future()
        await self._enqueue_background(
            _PendingWrite(message=message, completion=completion)
        )
        try:
            return await asyncio.shield(completion)
        except asyncio.CancelledError as cancellation:
            while not completion.done():
                try:
                    await asyncio.shield(completion)
                except asyncio.CancelledError:
                    continue
            completion.result()
            raise cancellation

    async def _enqueue_background(self, pending: _PendingWrite) -> None:
        self._raise_write_error()
        self._ensure_writer()
        while True:
            self._raise_write_error()
            try:
                self._pending_messages.put_nowait(pending)
                return
            except asyncio.QueueFull:
                async with self._queue_condition:
                    self._raise_write_error()
                    if not self._pending_messages.full():
                        continue
                    await self._queue_condition.wait()

    async def flush_async(self) -> Path:
        if self.background_writes:
            self._raise_write_error()
            if self._writer_task is None and self._pending_messages.empty():
                return self.path
            self._ensure_writer()
            join_task = asyncio.create_task(self._pending_messages.join())
            try:
                await asyncio.shield(join_task)
            except asyncio.CancelledError as cancellation:
                while not join_task.done():
                    try:
                        await asyncio.shield(join_task)
                    except asyncio.CancelledError:
                        continue
                raise cancellation
            self._raise_write_error()
        return self.path

    async def _append_serialized(self, message: MessageEnvelope) -> Path:
        async with self._async_lock:
            return await asyncio.to_thread(self.append, message)

    def snapshot(self) -> dict[str, object]:
        return {
            "path": str(self.path),
            "pendingWrites": self._pending_messages.qsize() + self._in_flight_writes,
            "maxPendingWrites": self.max_pending_writes,
            "backgroundWrites": self.background_writes,
            "writerRunning": self._writer_task is not None and not self._writer_task.done(),
            "error": None if self._write_error is None else str(self._write_error),
        }

    def _ensure_writer(self) -> None:
        if self._writer_task is None or self._writer_task.done():
            self._writer_task = asyncio.create_task(self._run_writer())

    async def _run_writer(self) -> None:
        while True:
            pending = await self._pending_messages.get()
            self._in_flight_writes = 1
            try:
                path = await self._append_serialized(pending.message)
            except Exception as exc:  # pragma: no cover - exercised by failure tests
                self._write_error = exc
                self._fail_pending(pending, exc)
                self._discard_pending_messages(exc)
                return
            else:
                if pending.completion is not None and not pending.completion.done():
                    pending.completion.set_result(path)
            finally:
                self._in_flight_writes = 0
                self._pending_messages.task_done()
                async with self._queue_condition:
                    self._queue_condition.notify_all()

    def _discard_pending_messages(self, cause: BaseException | None = None) -> None:
        while True:
            try:
                pending = self._pending_messages.get_nowait()
            except asyncio.QueueEmpty:
                return
            else:
                self._fail_pending(pending, cause)
                self._pending_messages.task_done()

    def _fail_pending(self, pending: _PendingWrite, cause: BaseException | None) -> None:
        if pending.completion is None or pending.completion.done():
            return
        error = RuntimeError("background JSONL write failed")
        if cause is not None:
            error.__cause__ = cause
        pending.completion.set_exception(error)

    def _raise_write_error(self) -> None:
        if self._write_error is not None:
            raise RuntimeError("background JSONL write failed") from self._write_error
