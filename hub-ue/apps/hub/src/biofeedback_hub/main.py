import asyncio
from typing import Any

from pydantic import ValidationError

from biofeedback_hub.auth import TokenAuthenticator
from biofeedback_hub.config import HubConfig, load_config
from biofeedback_hub.core.broker import ClientConnection, TopicBroker
from biofeedback_hub.core.runtime import HubRuntime
from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.schemas.envelope import ClientHello, MessageEnvelope, MessageType, make_error


def create_app(config: HubConfig | None = None) -> Any:
    try:
        from fastapi import FastAPI, WebSocket, WebSocketDisconnect
        from fastapi.middleware.cors import CORSMiddleware
    except ImportError as exc:
        raise RuntimeError("Install hub dependencies with: python -m pip install -e apps/hub") from exc

    resolved_config = config or load_config()
    broker = TopicBroker()
    session_logger = JsonlSessionLogger(resolved_config.log_dir, resolved_config.session_id)
    runtime = HubRuntime(broker=broker, session_logger=session_logger)
    authenticator = TokenAuthenticator(
        global_token=resolved_config.local_token,
        client_tokens=resolved_config.client_tokens or {},
    )

    app = FastAPI(title="Biofeedback Hub", version="0.1.1-dev")

    if resolved_config.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=resolved_config.cors_origins,
            allow_methods=["GET"],
            allow_headers=["*"],
        )

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "ok": True,
            "service": "biofeedback-hub",
            "sessionId": resolved_config.session_id,
            "pendingAcks": broker.pending_ack_count(),
        }

    @app.get("/status")
    async def status() -> dict[str, Any]:
        return {
            "ok": True,
            "service": "biofeedback-hub",
            "sessionId": resolved_config.session_id,
            **broker.snapshot(),
        }

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        await websocket.accept()

        client_id: str | None = None
        sender_task: asyncio.Task[None] | None = None

        try:
            hello_message = MessageEnvelope.model_validate_json(await websocket.receive_text())

            if hello_message.type != MessageType.HELLO:
                await _safe_send_text(
                    websocket,
                    make_error("hub", "hello_required", "First WebSocket message must be hello.").model_dump_json(),
                )
                await websocket.close(code=1008)
                return

            hello = ClientHello.model_validate(hello_message.payload)
            client_id = hello.clientId

            query_token = websocket.query_params.get("token")
            header_token = websocket.headers.get("x-biofeedback-token")

            if not authenticator.is_allowed(client_id, query_token or header_token):
                await _safe_send_text(
                    websocket,
                    make_error("hub", "unauthorized", "Client token was missing or invalid.").model_dump_json(),
                )
                await websocket.close(code=1008)
                return

            connection = await broker.connect(hello)
            session_logger.append(hello_message)

            sender_task = asyncio.create_task(_send_outbox(websocket, connection))

            while True:
                raw_message = await websocket.receive_text()
                message = MessageEnvelope.model_validate_json(raw_message)
                await runtime.handle_message(message)

        except WebSocketDisconnect:
            pass

        except ValidationError as exc:
            await _safe_send_text(
                websocket,
                make_error("hub", "validation_error", str(exc)).model_dump_json(),
            )

        finally:
            if sender_task is not None:
                sender_task.cancel()

            if client_id is not None:
                await broker.disconnect(client_id)

    return app


async def _safe_send_text(websocket: Any, text: str) -> bool:
    try:
        await websocket.send_text(text)
        return True
    except Exception:
        return False


async def _send_outbox(websocket: Any, connection: ClientConnection) -> None:
    while True:
        message = await connection.outbox.get()

        sent = await _safe_send_text(websocket, message.model_dump_json())

        if not sent:
            break


def run() -> None:
    try:
        import uvicorn
    except ImportError as exc:
        raise RuntimeError("Install hub dependencies with: python -m pip install -e apps/hub") from exc

    config = load_config()

    uvicorn.run(
        "biofeedback_hub.main:create_app",
        host=config.host,
        port=config.port,
        factory=True,
    )


if __name__ == "__main__":
    run()