from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass(frozen=True)
class HubConfig:
    host: str = "0.0.0.0"
    port: int = 8787
    log_dir: Path = Path("data/sessions")
    session_id: str = "session-local"
    local_token: str | None = None
    client_tokens: dict[str, str] | None = None
    cors_origins: list[str] | None = None


def load_config() -> HubConfig:
    return HubConfig(
        host=os.getenv("BIOFEEDBACK_HUB_HOST", "0.0.0.0"),
        port=int(os.getenv("BIOFEEDBACK_HUB_PORT", "8787")),
        log_dir=Path(os.getenv("BIOFEEDBACK_HUB_LOG_DIR", "data/sessions")),
        session_id=os.getenv("BIOFEEDBACK_SESSION_ID", default_session_id()),
        local_token=os.getenv("BIOFEEDBACK_HUB_TOKEN"),
        client_tokens=parse_client_tokens(os.getenv("BIOFEEDBACK_HUB_CLIENT_TOKENS")),
        cors_origins=parse_csv(
            os.getenv(
                "BIOFEEDBACK_HUB_CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            )
        ),
    )


def parse_client_tokens(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}

    tokens: dict[str, str] = {}
    for entry in raw.split(","):
        if ":" not in entry:
            continue
        client_id, token = entry.split(":", 1)
        client_id = client_id.strip()
        token = token.strip()
        if client_id and token:
            tokens[client_id] = token
    return tokens


def parse_csv(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def default_session_id() -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"session-{timestamp}"
