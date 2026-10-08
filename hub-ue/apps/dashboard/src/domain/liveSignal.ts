// Fase 4 — Lógica pura da visualização ao vivo (exigência ③).
//
// Mantida fora do componente para ser testável (vitest) e fora do estado React.
// Os eventos chegam newest-first (como em App.tsx `events`); aqui derivamos as
// janelas de ECG (waveform) e as séries escalares (HR/RR) em ordem cronológica.

import type { StreamEvent } from "./types";

const HRV_TOPIC = "hrv.raw";

export type ScalarField = "bpm" | "rrMs";

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

/** clientId do sensor da amostra hrv.raw mais recente. */
export function activeSensorId(events: StreamEvent[]): string | undefined {
  for (const event of events) {
    if (event.envelope.topic === HRV_TOPIC) {
      return event.envelope.clientId;
    }
  }
  return undefined;
}

/** Filtra eventos hrv.raw (opcionalmente de um sensor específico). */
export function ecgEvents(events: StreamEvent[], clientId?: string): StreamEvent[] {
  return events.filter(
    (event) => event.envelope.topic === HRV_TOPIC && (!clientId || event.envelope.clientId === clientId),
  );
}

/** Concatena as amostras de ECG (cronológicas), limitando às últimas `maxSamples`. */
export function flattenEcg(events: StreamEvent[], maxSamples: number): number[] {
  const chronological = [...events].reverse();
  const out: number[] = [];
  for (const event of chronological) {
    const ecg = event.envelope.payload?.ecg;
    if (Array.isArray(ecg)) {
      for (const sample of ecg) {
        const value = readNumber(sample);
        if (value !== undefined) {
          out.push(value);
        }
      }
    }
  }
  return out.length > maxSamples ? out.slice(out.length - maxSamples) : out;
}

/** Série escalar (bpm/rrMs) por evento, cronológica, limitada a `maxPoints`. */
export function scalarSeries(events: StreamEvent[], field: ScalarField, maxPoints: number): number[] {
  const chronological = [...events].reverse();
  const out: number[] = [];
  for (const event of chronological) {
    const value = readNumber(event.envelope.payload?.[field]);
    if (value !== undefined) {
      out.push(value);
    }
  }
  return out.length > maxPoints ? out.slice(out.length - maxPoints) : out;
}

/** Último valor escalar (eventos newest-first). */
export function latestScalar(events: StreamEvent[], field: ScalarField): number | undefined {
  for (const event of events) {
    const value = readNumber(event.envelope.payload?.[field]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/** Decima por passo fixo para caber em `maxPoints` (ex.: largura do canvas). */
export function downsample(values: number[], maxPoints: number): number[] {
  if (maxPoints <= 0 || values.length <= maxPoints) {
    return values.slice();
  }
  const step = values.length / maxPoints;
  const out: number[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    out.push(values[Math.floor(index * step)]);
  }
  return out;
}
