"""Handler do canal de controle /control (esqueleto — exigência ②).

A ponte (biofeedback-polarh10) já envia comandos para ws://localhost:8765/control,
mas esse endpoint NÃO existe hoje. Este módulo define o handler; a rota WebSocket
deve ser registrada no gateway.

Para ligar no FastAPI (core/websocket_gateway.py), adicionar dentro de
_configure_routes():

    from core.control import handle_control_command

    @self.app.websocket("/control")
    async def control_endpoint(ws: WebSocket):
        await ws.accept()
        try:
            while True:
                raw = await ws.receive_text()
                response = await handle_control_command(json.loads(raw), self.recorder)
                await ws.send_json(response)
        except Exception:
            pass

Depois que /control existir, a ponte pode rodar SEM --disable-recording-control.
"""

from __future__ import annotations

import logging
from typing import Any

ACTION_START = "start"
ACTION_STOP = "stop"


async def handle_control_command(message: dict[str, Any], recorder: Any) -> dict[str, Any]:
    """Roteia uma RecordingControl para o Recorder e devolve um ACK simples."""
    action = message.get("action")
    run_id = message.get("runId")
    capture = message.get("capture")

    if action == ACTION_START:
        logging.info("Control: start recording (runId=%s)", run_id)
        # TODO(②): recorder.start(run_id, capture)
        raise NotImplementedError("handle_control_command(start): chamar recorder.start().")

    if action == ACTION_STOP:
        logging.info("Control: stop recording (runId=%s)", run_id)
        # TODO(②): recorder.stop()
        raise NotImplementedError("handle_control_command(stop): chamar recorder.stop().")

    return {"ok": False, "error": f"unknown action: {action!r}"}
