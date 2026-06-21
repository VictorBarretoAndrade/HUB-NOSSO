import unittest
from pathlib import Path

from biofeedback_hub.config import HubConfig
from biofeedback_hub.main import create_app


class CorsTest(unittest.IsolatedAsyncioTestCase):
    async def test_health_allows_local_dashboard_origin(self) -> None:
        app = create_app(
            HubConfig(
                log_dir=Path("data/sessions"),
                session_id="session-test",
                cors_origins=["http://localhost:5173"],
            )
        )
        response = await call_get_health(app, origin="http://localhost:5173")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")


class AsgiResponse:
    def __init__(self, status_code: int, headers: dict[str, str]) -> None:
        self.status_code = status_code
        self.headers = headers


async def call_get_health(app: object, origin: str) -> AsgiResponse:
    messages: list[dict[str, object]] = []
    received = False

    async def receive() -> dict[str, object]:
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": b"", "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message: dict[str, object]) -> None:
        messages.append(message)

    await app(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/health",
            "raw_path": b"/health",
            "query_string": b"",
            "headers": [(b"host", b"testserver"), (b"origin", origin.encode("ascii"))],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        },
        receive,
        send,
    )
    start = next(message for message in messages if message["type"] == "http.response.start")
    headers = {
        key.decode("latin-1"): value.decode("latin-1")
        for key, value in start.get("headers", [])
    }
    return AsgiResponse(status_code=int(start["status"]), headers=headers)


if __name__ == "__main__":
    unittest.main()
