import asyncio
from contextlib import asynccontextmanager
from typing import Any

from pydantic import ValidationError

from biofeedback_hub.auth import TokenAuthenticator
from biofeedback_hub.adapters.lsl import LslDiscoveryProvider
from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.adapters.simulator_managed import SimulatedManagedHrvAdapter
from biofeedback_hub.config import HubConfig, load_config
from biofeedback_hub.core.broker import ClientConnection, OutboxClosed, TopicBroker
from biofeedback_hub.core.runtime import HubRuntime
from biofeedback_hub.core.sensor_manager import SENSOR_MANAGER_CLIENT_ID, SensorManager
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
    session_logger = JsonlSessionLogger(
        resolved_config.log_dir,
        resolved_config.session_id,
        background_writes=True,
    )
    runtime = HubRuntime(broker=broker, session_logger=session_logger)
    sensor_manager = SensorManager(
        broker=broker,
        runtime=runtime,
        adapters=[SimulatedManagedHrvAdapter()],
        providers=[
            LslDiscoveryProvider(
                enabled=resolved_config.lsl_enabled,
                discovery_timeout_seconds=resolved_config.lsl_discovery_timeout_seconds,
                pull_timeout_seconds=resolved_config.lsl_pull_timeout_seconds,
                time_correction_timeout_seconds=resolved_config.lsl_time_correction_timeout_seconds,
                max_chunk_samples=resolved_config.lsl_max_chunk_samples,
            )
        ],
    )
    authenticator = TokenAuthenticator(
        global_token=resolved_config.local_token,
        client_tokens=resolved_config.client_tokens or {},
    )

    @asynccontextmanager
    async def lifespan(_: Any) -> Any:
        await sensor_manager.start()
        try:
            yield
        finally:
            try:
                await sensor_manager.stop()
            finally:
                # A cleanup failure must not skip the final persistence attempt.
                await session_logger.flush_async()

    app = FastAPI(title="Biofeedback Hub", version="0.1.1-dev", lifespan=lifespan)
    app.state.session_logger = session_logger

    if resolved_config.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=resolved_config.cors_origins,
            allow_methods=["GET"],
            allow_headers=["*"],
        )

    @app.get("/health")
    async def health() -> dict[str, Any]:
        log_status = session_logger.snapshot()
        return {
            "ok": log_status["error"] is None,
            "service": "biofeedback-hub",
            "sessionId": resolved_config.session_id,
            "pendingAcks": broker.pending_ack_count(),
            "pendingLogWrites": log_status["pendingWrites"],
            "sessionLogError": log_status["error"],
        }

    @app.get("/status")
    async def status() -> dict[str, Any]:
        log_status = session_logger.snapshot()
        return {
            "ok": log_status["error"] is None,
            "service": "biofeedback-hub",
            "sessionId": resolved_config.session_id,
            **broker.snapshot(),
            "sensorManager": sensor_manager.snapshot(),
            "experienceLifecycle": runtime.experience_lifecycle_snapshot(),
            "sessionLog": log_status,
        }

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        await websocket.accept()

        client_id: str | None = None
        connection: ClientConnection | None = None
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

            if hello_message.clientId != client_id:
                await _safe_send_text(
                    websocket,
                    make_error(
                        "hub",
                        "hello_client_id_mismatch",
                        "Hello envelope clientId must match payload.clientId.",
                        correlation_id=hello_message.id,
                    ).model_dump_json(),
                )
                await websocket.close(code=1008)
                return

            query_token = websocket.query_params.get("token")
            header_token = websocket.headers.get("x-biofeedback-token")

            if not authenticator.is_allowed(client_id, query_token or header_token):
                await _safe_send_text(
                    websocket,
                    make_error("hub", "unauthorized", "Client token was missing or invalid.").model_dump_json(),
                )
                await websocket.close(code=1008)
                return

            if client_id == SENSOR_MANAGER_CLIENT_ID:
                await _safe_send_text(
                    websocket,
                    make_error(
                        "hub",
                        "reserved_client_id",
                        "sensor-manager is reserved for the internal Sensor Manager.",
                        correlation_id=hello_message.id,
                    ).model_dump_json(),
                )
                await websocket.close(code=1008)
                return

            connection = await broker.connect(hello)
            await session_logger.enqueue_async(
                hello_message.model_copy(update={"hubReceivedAt": utc_now_iso()})
            )

            sender_task = asyncio.create_task(_send_outbox(websocket, connection))

            while True:
                raw_message = await websocket.receive_text()
                if broker.get_client(client_id) is not connection:
                    await websocket.close(code=1008)
                    return
                message: MessageEnvelope | None = None
                try:
                    message = MessageEnvelope.model_validate_json(raw_message)
                    await runtime.handle_message(
                        message,
                        authenticated_client_id=client_id,
                    )
                except ValidationError as exc:
                    await connection.outbox.put(
                        make_error(
                            "hub",
                            "validation_error",
                            str(exc),
                            correlation_id=message.id if message is not None else None,
                        )
                    )

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

            if client_id is not None and connection is not None:
                await broker.disconnect(client_id, expected_connection=connection)
            try:
                await session_logger.flush_async()
            except RuntimeError:
                # The health endpoint retains the write error; a client
                # disconnect must not turn it into an unhandled WebSocket
                # exception.
                pass

    return app


async def _safe_send_text(websocket: Any, text: str) -> bool:
    try:
        await websocket.send_text(text)
        return True
    except Exception:
        return False


async def _send_outbox(websocket: Any, connection: ClientConnection) -> None:
    try:
        while True:
            message = await connection.outbox.get()

            sent = await _safe_send_text(websocket, message.model_dump_json())

            if not sent:
                break
    except OutboxClosed as exc:
        if connection.outbox.close_reason == "slow_consumer":
            await websocket.close(code=1013, reason=str(exc))
    except Exception:
        # The receiver owns the final WebSocket close and broker cleanup.
        return


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
