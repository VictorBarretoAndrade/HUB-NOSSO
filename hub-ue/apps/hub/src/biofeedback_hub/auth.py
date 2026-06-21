from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TokenAuthenticator:
    global_token: str | None = None
    client_tokens: dict[str, str] = field(default_factory=dict)

    def is_allowed(self, client_id: str, token: str | None) -> bool:
        client_token = self.client_tokens.get(client_id)
        if client_token is not None:
            return token == client_token

        if self.global_token is not None:
            return token == self.global_token

        return True
