// Capture Profile & Recording Modes — Fase 0 (contrato) + esqueleto.
//
// CaptureProfile é o objeto de 1ª classe que o dashboard monta, o hub transporta
// (no payload de experience.lifecycle) e o driver executa (via /control).
// Ver PLANO-NOVAS-FEATURES.md (exigência ②).

import type { KeyValueStorage, SubjectSnapshot } from "./subjectProfile";

export const CAPTURE_SCHEMA_VERSION = 2 as const;
export const CAPTURE_STORAGE_KEY = "biofeedback-dashboard.capture.v1";

export type RecordingMode = "stream" | "record" | "hybrid";
export type SignalKind = "ecg" | "rr" | "hr" | "hrv" | "eeg" | "imu";

export interface SensorSelection {
  clientId: string;
  signals: SignalKind[];
}

export interface CaptureProfile {
  schemaVersion: typeof CAPTURE_SCHEMA_VERSION;
  mode: RecordingMode;
  sensors: SensorSelection[];
  /** Capturar ECG bruto em arquivo (dado massivo → exige record/hybrid). */
  rawEcg: boolean;
}

export function createDefaultCaptureProfile(): CaptureProfile {
  return { schemaVersion: CAPTURE_SCHEMA_VERSION, mode: "stream", sensors: [], rawEcg: false };
}

/** Liga/desliga um sinal de um sensor, retornando um novo CaptureProfile (imutável). */
export function toggleSignal(profile: CaptureProfile, clientId: string, signal: SignalKind): CaptureProfile {
  const existing = profile.sensors.find((sensor) => sensor.clientId === clientId);
  let sensors: SensorSelection[];
  if (!existing) {
    sensors = [...profile.sensors, { clientId, signals: [signal] }];
  } else {
    const hasSignal = existing.signals.includes(signal);
    const signals = hasSignal
      ? existing.signals.filter((item) => item !== signal)
      : [...existing.signals, signal];
    sensors = profile.sensors
      .map((sensor) => (sensor.clientId === clientId ? { ...sensor, signals } : sensor))
      .filter((sensor) => sensor.signals.length > 0);
  }
  return { ...profile, sensors };
}

/** record/hybrid exigem ao menos um sensor com ao menos um sinal selecionado. */
export function isCaptureValid(profile: CaptureProfile): boolean {
  if (profile.mode === "stream") {
    return true;
  }
  return profile.sensors.some((sensor) => sensor.signals.length > 0);
}

/**
 * Monta o payload de experience.lifecycle carregando capture + subject.
 * É assim que ② e ① chegam ao hub (e ao log JSONL) e à ponte → driver.
 */
export function buildCaptureLifecyclePayload(args: {
  event: "started" | "ended";
  runId: string;
  label?: string;
  capture: CaptureProfile;
  subject?: SubjectSnapshot;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event: args.event,
    runId: args.runId,
    source: "dashboard",
    reason: "ui",
    capture: { mode: args.capture.mode, sensors: args.capture.sensors, rawEcg: args.capture.rawEcg },
  };
  if (args.label) {
    payload.label = args.label;
  }
  if (args.subject) {
    payload.subject = args.subject;
  }
  return payload;
}

export function saveCaptureProfile(storage: KeyValueStorage, profile: CaptureProfile): void {
  storage.setItem(CAPTURE_STORAGE_KEY, JSON.stringify(profile));
}

export function loadCaptureProfile(storage: KeyValueStorage): CaptureProfile | null {
  const raw = storage.getItem(CAPTURE_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CaptureProfile>;
    if (parsed.schemaVersion !== CAPTURE_SCHEMA_VERSION || !Array.isArray(parsed.sensors)) {
      return null;
    }
    const mode: RecordingMode = parsed.mode === "record" || parsed.mode === "hybrid" ? parsed.mode : "stream";
    return {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      mode,
      sensors: parsed.sensors as SensorSelection[],
      rawEcg: Boolean(parsed.rawEcg),
    };
  } catch {
    return null;
  }
}
