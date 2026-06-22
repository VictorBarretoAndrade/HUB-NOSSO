"""Handler do canal de controle /control (Fase 2 — exigência ②).

A ponte (biofeedback-polarh10) envia comandos de gravação para
ws://localhost:8765/control ao receber experience.lifecycle. Este módulo roteia
esses comandos para o Recorder.

Wiring no gateway (já feito em core/websocket_gateway*.py):

    @self.app.websocket("/control")
    async def control_endpoint(ws: WebSocket):
        await ws.accept()
        while True:
            raw = await ws.receive_text()
            await ws.send_json(await handle_control_command(json.loads(raw), self.recorder))

Com /control disponível, a ponte roda SEM --disable-recording-control.
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

    if recorder is None:
        return {"ok": False, "error": "recorder unavailable"}

    if action == ACTION_START:
        logging.info("Control: start recording (runId=%s)", run_id)
        path = recorder.start(run_id, capture)
        return {"ok": True, "action": ACTION_START, "runId": run_id, "path": str(path)}

    if action == ACTION_STOP:
        logging.info("Control: stop recording (runId=%s)", run_id)
        path = recorder.stop()
        return {"ok": True, "action": ACTION_STOP, "runId": run_id, "path": (str(path) if path else None)}

    return {"ok": False, "error": f"unknown action: {action!r}"}
