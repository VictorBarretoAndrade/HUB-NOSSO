import type { StreamEvent } from "./types";
import type { SensorSignalState } from "./sensorTelemetry";
import { deriveExperienceLifecycleEvents } from "./experienceLifecycle";

export interface ExperienceMarkerSummary {
  markerId: string;
  commandId?: string;
  label: string;
  note?: string;
  source?: string;
  reason?: string;
  sourceClientId: string;
  receivedAt: string;
  sessionTimeMs?: number | null;
}

export type SessionTimelineKind = "marker" | "state" | "biometric" | "lifecycle";

export interface BiometricSnapshot {
  sensorClientId: string;
  bpm?: number;
  rrMs?: number;
  ibiSampleCount: number;
  signalState: SensorSignalState;
  sampleAgeMs: number;
  receivedAt: string;
}

export interface SessionTimelineItem {
  id: string;
  kind: SessionTimelineKind;
  title: string;
  detail: string;
  note?: string;
  tone: "ok" | "warn" | "error" | "muted";
  source?: string;
  sourceClientId: string;
  receivedAt: string;
  sessionTimeMs?: number | null;
  commandId?: string;
  biometricSnapshot?: BiometricSnapshot;
}

const MARKER_TOPIC = "experience.marker";
const UNREAL_STATE_TOPIC = "unreal.state";
const HRV_RAW_TOPIC = "hrv.raw";
const MARKER_SNAPSHOT_MAX_AGE_MS = 5000;
const SENSOR_STREAM_GAP_MS = 10000;

interface HrvSample extends BiometricSnapshot {
  hrStatus?: number;
  sessionTimeMs?: number | null;
}

export function deriveExperienceMarkers(events: StreamEvent[]): ExperienceMarkerSummary[] {
  const markers = events
    .filter((event) => event.envelope.topic === MARKER_TOPIC)
    .map<ExperienceMarkerSummary | null>((event) => {
      const payload = event.envelope.payload ?? {};
      const label = readString(payload.label);
      if (!label) {
        return null;
      }

      return {
        markerId: readString(payload.markerId) ?? event.envelope.id ?? `${event.receivedAt}-${event.envelope.clientId}`,
        commandId: readString(payload.commandId),
        label,
        note: readString(payload.note),
        source: readString(payload.source),
        reason: readString(payload.reason),
        sourceClientId: event.envelope.clientId,
        receivedAt: event.receivedAt,
        sessionTimeMs: event.envelope.sessionTimeMs ?? null,
      } satisfies ExperienceMarkerSummary;
    })
    .filter((marker): marker is ExperienceMarkerSummary => marker !== null)
    .sort(newestFirst);

  const seen = new Set<string>();
  return markers.filter((marker) => {
    const key = marker.commandId || marker.markerId;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function latestExperienceMarker(events: StreamEvent[]): ExperienceMarkerSummary | null {
  return deriveExperienceMarkers(events)[0] ?? null;
}

export function deriveSessionTimeline(events: StreamEvent[], limit = 12): SessionTimelineItem[] {
  const hrvSamples = deriveHrvSamples(events);
  const markers = deriveExperienceMarkers(events).map((marker) => markerToTimelineItem(marker, latestSnapshotBefore(marker.receivedAt, hrvSamples)));
  const states = collapseStateHeartbeats(
    events
      .filter((event) => event.envelope.topic === UNREAL_STATE_TOPIC)
      .map(stateToTimelineItem),
  );
  const biometricObservations = deriveBiometricObservations(hrvSamples);
  const lifecycleItems = deriveExperienceLifecycleEvents(events).map(lifecycleToTimelineItem);

  return [...markers, ...states, ...biometricObservations, ...lifecycleItems].sort(newestFirst).slice(0, limit);
}

function markerToTimelineItem(marker: ExperienceMarkerSummary, biometricSnapshot?: BiometricSnapshot): SessionTimelineItem {
  return {
    id: `marker-${marker.markerId}`,
    kind: "marker",
    title: marker.label,
    detail: markerDetail(marker, biometricSnapshot),
    note: marker.note,
    tone: "ok",
    source: marker.source,
    sourceClientId: marker.sourceClientId,
    receivedAt: marker.receivedAt,
    sessionTimeMs: marker.sessionTimeMs,
    commandId: marker.commandId,
    biometricSnapshot,
  };
}

function stateToTimelineItem(event: StreamEvent): SessionTimelineItem {
  const payload = event.envelope.payload ?? {};
  const state = normalizeState(readString(payload.state)) ?? stateFromStatus(readString(payload.status)) ?? "unknown";
  const status = readString(payload.status);
  const commandId = readString(payload.lastCommandId);
  const fps = readNumber(payload.fps) ?? readNestedNumber(payload.telemetry, "fps");
  const reason = readString(payload.reason);

  return {
    id: `state-${event.receivedAt}-${event.envelope.clientId}`,
    kind: "state",
    title: stateLabel(state),
    detail: joinDetails([
      status ? `status ${status}` : null,
      typeof fps === "number" ? `fps ${formatNumber(fps)}` : null,
      commandId ? `command ${commandId}` : null,
      reason ? `reason ${reason}` : null,
    ]),
    tone: stateTone(state),
    source: event.envelope.clientId,
    sourceClientId: event.envelope.clientId,
    receivedAt: event.receivedAt,
    sessionTimeMs: event.envelope.sessionTimeMs ?? null,
    commandId,
  };
}

function deriveHrvSamples(events: StreamEvent[]): HrvSample[] {
  return events
    .filter((event) => event.envelope.topic === HRV_RAW_TOPIC)
    .map((event) => {
      const payload = event.envelope.payload ?? {};
      const bpm = readNumber(payload.bpm);
      const rrMs = readNumber(payload.rrMs);
      const hrStatus = readNumber(payload.hrStatus);
      const ibiSampleCount = readNumber(payload.ibiSampleCount);
      const ibiMs = Array.isArray(payload.ibiMs) ? payload.ibiMs : [];
      return {
        sensorClientId: event.envelope.clientId,
        bpm: typeof bpm === "number" ? Math.round(bpm) : undefined,
        rrMs: typeof rrMs === "number" ? roundOneDecimal(rrMs) : undefined,
        ibiSampleCount: typeof ibiSampleCount === "number" ? ibiSampleCount : ibiMs.length,
        signalState: signalStateFromSample(bpm, hrStatus),
        sampleAgeMs: 0,
        receivedAt: event.receivedAt,
        hrStatus,
        sessionTimeMs: event.envelope.sessionTimeMs ?? null,
      } satisfies HrvSample;
    })
    .sort(oldestFirst);
}

function latestSnapshotBefore(receivedAt: string, samples: HrvSample[]): BiometricSnapshot | undefined {
  const markerTime = Date.parse(receivedAt);
  const latest = [...samples]
    .filter((sample) => {
      const sampleTime = Date.parse(sample.receivedAt);
      return sampleTime <= markerTime && markerTime - sampleTime <= MARKER_SNAPSHOT_MAX_AGE_MS;
    })
    .sort(newestFirst)[0];

  if (!latest) {
    return undefined;
  }

  return {
    sensorClientId: latest.sensorClientId,
    bpm: latest.bpm,
    rrMs: latest.rrMs,
    ibiSampleCount: latest.ibiSampleCount,
    signalState: latest.signalState,
    sampleAgeMs: markerTime - Date.parse(latest.receivedAt),
    receivedAt: latest.receivedAt,
  };
}

function deriveBiometricObservations(samples: HrvSample[]): SessionTimelineItem[] {
  const observations: SessionTimelineItem[] = [];
  const byClient = new Map<string, HrvSample[]>();

  for (const sample of samples) {
    byClient.set(sample.sensorClientId, [...(byClient.get(sample.sensorClientId) ?? []), sample]);
  }

  for (const [clientId, clientSamples] of byClient.entries()) {
    let previousSignal: SensorSignalState | null = null;
    let previousSample: HrvSample | null = null;

    for (const sample of clientSamples) {
      if (previousSample) {
        const gapMs = Date.parse(sample.receivedAt) - Date.parse(previousSample.receivedAt);
        if (gapMs > SENSOR_STREAM_GAP_MS) {
          observations.push(biometricObservationItem("gap", clientId, sample, gapMs));
        }
      }

      if (sample.signalState === "poor" && previousSignal !== "poor") {
        observations.push(biometricObservationItem("poor", clientId, sample));
      }
      if (sample.signalState === "streaming" && previousSignal === "poor") {
        observations.push(biometricObservationItem("recovered", clientId, sample));
      }

      previousSignal = sample.signalState;
      previousSample = sample;
    }
  }

  return observations;
}

function biometricObservationItem(
  type: "poor" | "recovered" | "gap",
  clientId: string,
  sample: HrvSample,
  gapMs?: number,
): SessionTimelineItem {
  const snapshot = sampleToSnapshot(sample);
  const title =
    type === "poor" ? "Sensor signal poor" : type === "recovered" ? "Sensor signal recovered" : "Sensor stream gap";
  const tone = type === "recovered" ? "ok" : "warn";

  return {
    id: `biometric-${type}-${clientId}-${sample.receivedAt}`,
    kind: "biometric",
    title,
    detail: biometricObservationDetail(clientId, sample, gapMs),
    tone,
    source: clientId,
    sourceClientId: clientId,
    receivedAt: sample.receivedAt,
    sessionTimeMs: sample.sessionTimeMs,
    biometricSnapshot: snapshot,
  };
}

function lifecycleToTimelineItem(lifecycle: ReturnType<typeof deriveExperienceLifecycleEvents>[number]): SessionTimelineItem {
  const isStarted = lifecycle.event === "started";
  return {
    id: `lifecycle-${lifecycle.runId}-${lifecycle.event}`,
    kind: "lifecycle",
    title: isStarted ? "Experience started" : "Experience ended",
    detail: joinDetails([
      lifecycle.label ? `label ${lifecycle.label}` : null,
      lifecycle.source ? `source ${lifecycle.source}` : null,
      lifecycle.reason ? `reason ${lifecycle.reason}` : null,
      `run ${lifecycle.runId}`,
    ]),
    tone: isStarted ? "ok" : "warn",
    source: lifecycle.source,
    sourceClientId: lifecycle.sourceClientId,
    receivedAt: lifecycle.receivedAt,
  };
}

function sampleToSnapshot(sample: HrvSample): BiometricSnapshot {
  return {
    sensorClientId: sample.sensorClientId,
    bpm: sample.bpm,
    rrMs: sample.rrMs,
    ibiSampleCount: sample.ibiSampleCount,
    signalState: sample.signalState,
    sampleAgeMs: 0,
    receivedAt: sample.receivedAt,
  };
}

function collapseStateHeartbeats(items: SessionTimelineItem[]): SessionTimelineItem[] {
  const collapsed: SessionTimelineItem[] = [];
  for (const item of [...items].sort(oldestFirst)) {
    const previous = collapsed[collapsed.length - 1];
    if (previous && previous.title === item.title && stateSignature(previous) === stateSignature(item)) {
      collapsed[collapsed.length - 1] = item;
    } else {
      collapsed.push(item);
    }
  }
  return collapsed.sort(newestFirst);
}

function markerDetail(marker: ExperienceMarkerSummary, biometricSnapshot?: BiometricSnapshot): string {
  return joinDetails([
    marker.note ?? null,
    marker.source ? `source ${marker.source}` : null,
    marker.commandId ? `command ${marker.commandId}` : null,
    marker.reason ? `reason ${marker.reason}` : null,
    biometricSnapshot ? biometricSnapshotDetail(biometricSnapshot) : null,
  ]);
}

function biometricSnapshotDetail(snapshot: BiometricSnapshot): string {
  return joinDetails([
    typeof snapshot.bpm === "number" ? `BPM ${snapshot.bpm}` : null,
    typeof snapshot.rrMs === "number" ? `RR ${formatNumber(snapshot.rrMs)}ms` : null,
    `IBI ${snapshot.ibiSampleCount}`,
    `signal ${snapshot.signalState}`,
  ]);
}

function biometricObservationDetail(clientId: string, sample: HrvSample, gapMs?: number): string {
  return joinDetails([
    `sensor ${clientId}`,
    typeof gapMs === "number" ? `gap ${Math.round(gapMs / 1000)}s` : null,
    typeof sample.bpm === "number" ? `BPM ${sample.bpm}` : null,
    typeof sample.rrMs === "number" ? `RR ${formatNumber(sample.rrMs)}ms` : null,
    typeof sample.hrStatus === "number" && sample.hrStatus !== 1 ? `status ${sample.hrStatus}` : null,
  ]);
}

function newestFirst<T extends { receivedAt: string }>(left: T, right: T): number {
  return Date.parse(right.receivedAt) - Date.parse(left.receivedAt);
}

function oldestFirst<T extends { receivedAt: string }>(left: T, right: T): number {
  return Date.parse(left.receivedAt) - Date.parse(right.receivedAt);
}

function stateSignature(item: SessionTimelineItem): string {
  return item.detail
    .split("; ")
    .filter((part) => !part.startsWith("fps "))
    .join("; ");
}

function joinDetails(parts: Array<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join("; ") || "--";
}

function normalizeState(value: string | undefined): "running" | "paused" | "error" | "unknown" | null {
  const normalized = value?.toLowerCase();
  if (normalized === "running" || normalized === "paused" || normalized === "error") {
    return normalized;
  }
  return null;
}

function stateFromStatus(value: string | undefined): "running" | "paused" | "error" | null {
  const normalized = value?.toLowerCase();
  if (normalized === "idle") return "paused";
  if (normalized === "online" || normalized === "busy") return "running";
  if (normalized === "error") return "error";
  return null;
}

function stateLabel(state: "running" | "paused" | "error" | "unknown"): string {
  return `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
}

function stateTone(state: "running" | "paused" | "error" | "unknown"): "ok" | "warn" | "error" | "muted" {
  if (state === "running") return "ok";
  if (state === "paused") return "warn";
  if (state === "error") return "error";
  return "muted";
}

function signalStateFromSample(bpm: number | undefined, hrStatus: number | undefined): SensorSignalState {
  if (typeof hrStatus === "number" && hrStatus < 0) {
    return "poor";
  }
  if ((typeof bpm !== "number" || bpm <= 0) && typeof hrStatus === "number" && hrStatus <= 0) {
    return "poor";
  }
  if (hrStatus === 1) {
    return "streaming";
  }
  return "unknown";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNestedNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return readNumber((value as Record<string, unknown>)[key]);
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
