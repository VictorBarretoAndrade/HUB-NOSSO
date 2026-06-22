"""Recorder de ECG bruto (Fase 2 — exigência ②).

Gravação acionada pelo handler de /control (core/control.py), que recebe o comando
da ponte (biofeedback-polarh10) disparado por experience.lifecycle.

Saída (D1/D2/D3): por padrão grava em data/recordings/<runId>_<device>_ecg.{csv,npy}
  - CSV: uma linha por amostra (timestamp, seq, índice, ecg, rr, hr, métricas).
  - NPY: vetor float64 com o ECG bruto concatenado (gerado no stop()).

O CSV é escrito de forma incremental (baixa memória); o ECG é acumulado para o NPY.
"""

from __future__ import annotations

import csv
import logging
import re
from pathlib import Path
from typing import Any

CSV_HEADER = [
    "timestamp",
    "seq",
    "sampleIndex",
    "ecg",
    "rr",
    "hr",
    "rmssd",
    "sdnn",
    "pnn50",
    "lf_hf",
]

DEFAULT_DEVICE = "polar-h10"


def _safe_name(value: str) -> str:
    """Normaliza um nome para uso seguro em arquivo."""
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "run"


class Recorder:
    """Grava amostras de ECG (e métricas) durante uma janela de experiência."""

    def __init__(self, config: Any = None, output_dir: str = "data/recordings") -> None:
        self.config = config
        self.output_dir = Path(output_dir)
        self.run_id: str | None = None
        self.device = DEFAULT_DEVICE
        self.active = False
        self._csv_path: Path | None = None
        self._npy_path: Path | None = None
        self._file: Any = None
        self._writer: Any = None
        self._ecg: list[float] = []

    def start(self, run_id: str | None, capture: dict[str, Any] | None = None) -> Path:
        """Abre o arquivo de gravação para a run e começa a aceitar amostras."""
        if self.active:
            self.stop()

        self.run_id = run_id or "run"
        self.device = self._device_from_capture(capture)

        self.output_dir.mkdir(parents=True, exist_ok=True)
        base = self.output_dir / f"{_safe_name(self.run_id)}_{_safe_name(self.device)}_ecg"
        self._csv_path = base.with_suffix(".csv")
        self._npy_path = base.with_suffix(".npy")

        self._file = self._csv_path.open("w", newline="", encoding="utf-8")
        self._writer = csv.writer(self._file)
        self._writer.writerow(CSV_HEADER)

        self._ecg = []
        self.active = True
        logging.info("Recorder: gravando em %s", self._csv_path)
        return self._csv_path

    def write(self, packet: dict[str, Any]) -> None:
        """Anexa um pacote (samples + metrics) ao arquivo aberto."""
        if not self.active or self._writer is None:
            return

        seq = packet.get("seq")
        timestamp = packet.get("timestamp")
        samples = packet.get("samples") or []
        metrics = packet.get("metrics") or {}

        for index, value in enumerate(samples):
            try:
                self._ecg.append(float(value))
            except (TypeError, ValueError):
                continue
            self._writer.writerow(
                [
                    timestamp,
                    seq,
                    index,
                    value,
                    metrics.get("rr"),
                    metrics.get("hr"),
                    metrics.get("rmssd"),
                    metrics.get("sdnn"),
                    metrics.get("pnn50"),
                    metrics.get("lf_hf"),
                ]
            )

        if self._file is not None:
            self._file.flush()

    def stop(self) -> Path | None:
        """Fecha o CSV, escreve o NPY do ECG bruto e retorna o caminho do CSV."""
        if not self.active:
            return None

        self.active = False

        if self._file is not None:
            self._file.close()
            self._file = None
            self._writer = None

        if self._npy_path is not None:
            try:
                import numpy as np

                np.save(self._npy_path, np.asarray(self._ecg, dtype=np.float64))
                logging.info("Recorder: ECG salvo em %s (%d amostras)", self._npy_path, len(self._ecg))
            except Exception as exc:  # numpy ausente ou falha de escrita
                logging.warning("Recorder: NPY não gerado (%s)", exc)
                self._npy_path = None

        return self._csv_path

    def _device_from_capture(self, capture: dict[str, Any] | None) -> str:
        if isinstance(capture, dict):
            sensors = capture.get("sensors")
            if isinstance(sensors, list) and sensors:
                first = sensors[0]
                if isinstance(first, dict) and first.get("clientId"):
                    return str(first["clientId"])
        return DEFAULT_DEVICE
