"""Exportador de dado massivo para .npy / .mat (esqueleto — exigência ④).

Por que aqui: numpy/scipy já são dependências do driver (requirements.txt); o hub
não as tem (apps/hub/pyproject.toml). A geração de .mat/.npy de ECG bruto é
SERVER-SIDE — o browser não retém o ECG (ver PLANO-NOVAS-FEATURES.md, descoberta B).

Fonte do dado: o log JSONL do hub (data/sessions/<sessionId>.jsonl), onde TODO
envelope é persistido, ou o arquivo bruto do Recorder. (Decisão em aberto —
ver hub-ue/docs/decisions-novas-features.md.)

Uso pretendido (a partir da raiz do driver):
    python -m tools.export_cli --session session-XXingest --signal ecg --format npy --out ecg.npy
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

SIGNALS = ("ecg", "rr", "hr")
FORMATS = ("npy", "mat")


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
    """Extrai uma série (ecg/rr/hr) dos envelopes hrv.raw."""
    # TODO(④): filtrar topic == "hrv.raw"; para ecg concatenar payload["ecg"];
    #          para rr/hr coletar payload["rrMs"]/payload["bpm"]. Preservar ordem/seq.
    raise NotImplementedError("extract_series: implementar extração por sinal.")


def write_npy(values: list[float], out: Path) -> None:
    import numpy as np  # import tardio: dependência pesada

    np.save(out, np.asarray(values, dtype=np.float64))


def write_mat(values: list[float], out: Path, signal: str) -> None:
    from scipy.io import savemat  # import tardio

    savemat(out, {signal: values})


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Exporta sinais de sessão para .npy/.mat.")
    parser.add_argument("--session", required=True, help="caminho do .jsonl OU sessionId")
    parser.add_argument("--signal", choices=SIGNALS, default="ecg")
    parser.add_argument("--format", choices=FORMATS, default="npy")
    parser.add_argument("--out", required=True)
    parser.add_argument("--sessions-dir", default="data/sessions")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)

    source = Path(args.session)
    if not source.exists():
        source = Path(args.sessions_dir) / f"{args.session}.jsonl"

    records = load_jsonl(source)
    values = extract_series(records, args.signal)

    out = Path(args.out)
    if args.format == "npy":
        write_npy(values, out)
    else:
        write_mat(values, out, args.signal)

    # TODO(④): embutir metadados do sujeito/captura (ExportEnvelopeV2) num sidecar .json.
    print(f"[export] {len(values)} amostras de {args.signal} -> {out}")


if __name__ == "__main__":
    main()
