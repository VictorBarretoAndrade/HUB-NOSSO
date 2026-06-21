"""Recorder de ECG bruto (esqueleto — exigência ②).

O Recorder é o EXECUTOR da gravação no driver. Ele é acionado pelo handler de
/control (core/control.py), que por sua vez recebe o comando da ponte
(biofeedback-polarh10) disparado por experience.lifecycle.

Decisões em aberto (ver hub-ue/docs/decisions-novas-features.md):
  - Formato do arquivo bruto (CSV agora? NPY direto? Parquet?).
  - Dono do arquivo: driver (este Recorder) vs. log JSONL do hub.
  - Nomenclatura: <runId>_<deviceId>_ecg.<ext> sob qual diretório.

Hoje NADA é gravado: main.py só faz stream. Este esqueleto fixa a interface.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

LOG_RECORDER_START = "Recorder start requested"
LOG_RECORDER_STOP = "Recorder stop requested"


class Recorder:
    """Grava amostras de ECG (e metadados) durante uma janela de experiência."""

    def __init__(self, config: Any, output_dir: str = "data/recordings") -> None:
        self.config = config
        self.output_dir = Path(output_dir)
        self.run_id: str | None = None
        self.active = False
        self._path: Path | None = None

    def start(self, run_id: str, capture: dict[str, Any] | None = None) -> Path:
        """Abre o arquivo de gravação para a run e começa a aceitar amostras."""
        logging.info(LOG_RECORDER_START)
        # TODO(②): criar output_dir, abrir handle, escrever cabeçalho conforme `capture`
        #          (rawEcg, sinais selecionados) e respeitar stream.send_ecg/rr/hr.
        raise NotImplementedError("Recorder.start: implementar abertura de arquivo e cabeçalho.")

    def write(self, packet: dict[str, Any]) -> None:
        """Anexa um pacote (samples + metrics) ao arquivo aberto."""
        if not self.active:
            return
        # TODO(②): serializar samples/metrics linha a linha (timestamp, seq, valor, rr, hr...).
        raise NotImplementedError("Recorder.write: implementar escrita das amostras.")

    def stop(self) -> Path | None:
        """Fecha o arquivo e retorna o caminho gravado."""
        logging.info(LOG_RECORDER_STOP)
        # TODO(②): flush + fechar handle; retornar self._path.
        raise NotImplementedError("Recorder.stop: implementar fechamento do arquivo.")
