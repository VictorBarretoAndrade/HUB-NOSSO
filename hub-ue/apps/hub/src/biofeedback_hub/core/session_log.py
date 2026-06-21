from __future__ import annotations

from pathlib import Path

from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.schemas.envelope import MessageEnvelope


class JsonlSessionLogger:
    def __init__(self, root_dir: Path, session_id: str) -> None:
        self.root_dir = root_dir
        self.session_id = session_id
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.root_dir / f"{session_id}.jsonl"

    def append(self, message: MessageEnvelope) -> Path:
        if message.hubReceivedAt is None:
            message = message.model_copy(update={"hubReceivedAt": utc_now_iso()})

        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(message.model_dump_json() + "\n")
        return self.path
