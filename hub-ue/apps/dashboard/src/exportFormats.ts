// Export / Save — Fase 0 (contrato) + esqueleto.
//
// Um ExportJob = escopo × formato × destino. O destino é DERIVADO (regra, não escolha):
// dado massivo (ECG) e .mat vão para o servidor; texto/escalar pode sair do browser.
// Ver PLANO-NOVAS-FEATURES.md (exigência ④).

import type { CaptureProfile } from "./captureProfile";
import type { SubjectSnapshot } from "./subjectProfile";

export const EXPORT_SCHEMA_VERSION = 2 as const;

export type ExportScope = "report" | "rr" | "hr" | "ecg";
export type ExportFormat = "json" | "csv" | "npy" | "mat";
export type ExportTarget = "client" | "server";

export interface ExportJob {
  scope: ExportScope;
  format: ExportFormat;
  target: ExportTarget;
  includeSubjectMetadata: boolean;
}

/** Cabeçalho lógico comum a TODO export — garante contexto fisiológico junto do dado. */
export interface ExportEnvelopeV2 {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  subject?: SubjectSnapshot;
  capture?: CaptureProfile;
  run?: { runId?: string; startedAt?: string; endedAt?: string };
}

/**
 * Regra de roteamento client/server (a "janela de salvamento" usa isto, não pergunta ao usuário).
 *   - .mat            → sempre servidor
 *   - ECG (massivo)   → sempre servidor
 *   - .npy de rr/hr   → cliente (formato simples, série escalar)
 *   - json/csv        → cliente
 */
export function resolveExportTarget(scope: ExportScope, format: ExportFormat): ExportTarget {
  if (format === "mat") return "server";
  if (scope === "ecg") return "server";
  if (format === "npy") return scope === "rr" || scope === "hr" ? "client" : "server";
  return "client";
}

export function buildExportJob(
  scope: ExportScope,
  format: ExportFormat,
  includeSubjectMetadata = true,
): ExportJob {
  return { scope, format, target: resolveExportTarget(scope, format), includeSubjectMetadata };
}

/**
 * Monta o cabeçalho v2 que embrulha qualquer export com o contexto fisiológico
 * (sujeito + captura + run). É a fundação da Fase 0: garante que o `.npy`/`.mat`
 * ou o JSON do Report cheguem ao analista com o contexto da coleta.
 */
export function buildExportEnvelopeV2(args: {
  exportedAt?: string;
  subject?: SubjectSnapshot;
  capture?: CaptureProfile;
  run?: ExportEnvelopeV2["run"];
}): ExportEnvelopeV2 {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: args.exportedAt ?? new Date().toISOString(),
    subject: args.subject,
    capture: args.capture,
    run: args.run,
  };
}

/**
 * Serializa uma série numérica no formato NumPy .npy v1.0 (little-endian float64).
 * Implementado de fato — é determinístico e o código futuro pode usar direto para rr/hr.
 */
export function encodeNpyFloat64(values: readonly number[]): Uint8Array {
  const magic = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]; // \x93NUMPY
  const headerText = `{'descr': '<f8', 'fortran_order': False, 'shape': (${values.length},), }`;
  const preludeLen = magic.length + 2 /* version */ + 2 /* header len u16 */;
  const unpadded = preludeLen + headerText.length + 1 /* trailing \n */;
  const pad = (64 - (unpadded % 64)) % 64;
  const header = `${headerText}${" ".repeat(pad)}\n`;
  const headerBytes = new TextEncoder().encode(header);

  const buffer = new ArrayBuffer(preludeLen + headerBytes.length + values.length * 8);
  const view = new DataView(buffer);
  let offset = 0;
  for (const byte of magic) view.setUint8(offset++, byte);
  view.setUint8(offset++, 1); // version major
  view.setUint8(offset++, 0); // version minor
  view.setUint16(offset, headerBytes.length, true);
  offset += 2;
  for (const byte of headerBytes) view.setUint8(offset++, byte);
  for (const value of values) {
    view.setFloat64(offset, value, true);
    offset += 8;
  }
  return new Uint8Array(buffer);
}

/**
 * Dispara um ExportJob de destino "server" pedindo o arquivo binário ao hub/ferramenta.
 * TODO(④): definir o endpoint real (GET /export?session=...) — ver decisions-novas-features.md.
 */
export async function requestServerExport(_endpoint: string, _job: ExportJob, _runId?: string): Promise<Blob> {
  throw new Error("requestServerExport: not implemented — depende do endpoint/CLI server-side (Fase 3).");
}
