"""Exportador de dado massivo para .npy / .mat (Fase 3 — exigência ④).

Por que aqui: numpy/scipy já são dependências do driver (requirements.txt); o hub
não as tem. A geração de .mat/.npy de ECG bruto é SERVER-SIDE — o browser não
retém o ECG (ver PLANO-NOVAS-FEATURES.md, descoberta B).

Fonte do dado: o log JSONL do hub (data/sessions/<sessionId>.jsonl), onde TODO
envelope é persistido — inclusive o experience.lifecycle "started" com o snapshot
do sujeito e a config de captura. Por isso os metadados acompanham o export.

Saída:
  - <out>            arquivo binário (.npy ou .mat) com a série numérica.
  - <out>.meta.json  envelope v2 com sujeito + captura + run (a menos de --no-meta).

Uso (a partir da raiz do driver):
    python -m tools.export_cli --session session-XYZ --signal ecg --format npy --out ecg.npy
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SIGNALS = ("ecg", "rr", "hr")
FORMATS = ("npy", "mat")

HRV_TOPIC = "hrv.raw"
LIFECYCLE_TOPIC = "experience.lifecycle"

# Campo do payload hrv.raw por sinal (rr/hr são escalares; ecg é uma lista por pacote).
SCALAR_FIELD = {"rr": "rrMs", "hr": "bpm"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _to_float(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    """Lê um log de sessão JSONL e devolve os envelopes."""
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def extract_series(records: list[dict[str, Any]], signal: str) -> list[float]:
    """Extrai uma série (ecg/rr/hr) dos envelopes hrv.raw, em ordem de log."""
    values: list[float] = []
    for record in records:
        if record.get("topic") != HRV_TOPIC:
            continue
        payload = record.get("payload") or {}

        if signal == "ecg":
            ecg = payload.get("ecg")
            if isinstance(ecg, list):
                values.extend(value for sample in ecg if (value := _to_float(sample)) is not None)
        else:
            value = _to_float(payload.get(SCALAR_FIELD[signal]))
            if value is not None:
                values.append(value)

    return values


def latest_lifecycle_started(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Último envelope experience.lifecycle com event=started (carrega subject/capture)."""
    found: dict[str, Any] | None = None
    for record in records:
        if record.get("topic") != LIFECYCLE_TOPIC:
            continue
        payload = record.get("payload") or {}
        if payload.get("event") == "started":
            found = record
    return found


def build_export_meta(records: list[dict[str, Any]], signal: str, sample_count: int, exported_at: str) -> dict[str, Any]:
    """Monta o ExportEnvelopeV2 (sujeito + captura + run) a partir do log."""
    lifecycle = latest_lifecycle_started(records)
    payload = (lifecycle or {}).get("payload") or {}
    return {
        "schemaVersion": 2,
        "exportedAt": exported_at,
        "signal": signal,
        "sampleCount": sample_count,
        "subject": payload.get("subject"),
        "capture": payload.get("capture"),
        "run": {
            "runId": payload.get("runId"),
            "startedAt": (lifecycle or {}).get("hubReceivedAt"),
        },
    }


def write_npy(values: list[float], out: Path) -> None:
    import numpy as np  # import tardio: dependência pesada

    np.save(out, np.asarray(values, dtype=np.float64))


def write_mat(values: list[float], out: Path, signal: str) -> None:
    import numpy as np
    from scipy.io import savemat  # import tardio

    savemat(out, {signal: np.asarray(values, dtype=np.float64)})


def write_meta(meta: dict[str, Any], out: Path) -> Path:
    meta_path = out.with_suffix(".meta.json")
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return meta_path


def resolve_source(session: str, sessions_dir: str) -> Path:
    source = Path(session)
    if source.exists():
        return source
    return Path(sessions_dir) / f"{session}.jsonl"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Exporta sinais de sessão para .npy/.mat.")
    parser.add_argument("--session", required=True, help="caminho do .jsonl OU sessionId")
    parser.add_argument("--signal", choices=SIGNALS, default="ecg")
    parser.add_argument("--format", choices=FORMATS, default="npy")
    parser.add_argument("--out", required=True)
    parser.add_argument("--sessions-dir", default="data/sessions")
    parser.add_argument("--no-meta", action="store_true", help="não gerar o sidecar .meta.json")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)

    source = resolve_source(args.session, args.sessions_dir)
    records = load_jsonl(source)
    values = extract_series(records, args.signal)

    out = Path(args.out)
    if args.format == "npy":
        write_npy(values, out)
    else:
        write_mat(values, out, args.signal)

    print(f"[export] {len(values)} amostras de {args.signal} -> {out}")

    if not args.no_meta:
        meta = build_export_meta(records, args.signal, len(values), _utc_now())
        meta_path = write_meta(meta, out)
        print(f"[export] metadados (sujeito + captura) -> {meta_path}")


if __name__ == "__main__":
    main()
