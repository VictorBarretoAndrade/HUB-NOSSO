import type { HubClient, StreamEvent } from "./types";

const HRV_RAW_TOPIC = "hrv.raw";
const STREAMING_MAX_AGE_MS = 5000;
const SENSOR_TOPIC_HINTS = [
  "sensor",
  "telemetry",
  "hrv",
  "ecg",
  "eeg",
  "imu",
  "accelerometer",
  "gyroscope",
  "temperature",
  "respiration",
  "oximeter",
  "pressure",
  "motion",
];
const SENSOR_PAYLOAD_KEYS = [
  "bpm",
  "rrMs",
  "ibiMs",
  "hrStatus",
  "sensorId",
  "sensorType",
  "sensor",
  "device",
  "ecg",
  "eeg",
  "x",
  "y",
  "z",
];

export type SensorSignalState = "unknown" | "streaming" | "stale" | "poor";

export interface SensorTelemetrySummary {
  clientId: string;
  device?: string;
  source?: string;
  topic?: string;
  bpm?: number;
  rrMs?: number;
  ibiSampleCount: number;
  hrStatus?: number;
  sequence?: number;
  lastReceivedAt?: string;
  lastSampleAgeMs?: number;
  sampleCount: number;
  samplesPerMinute?: number;
  signalState: SensorSignalState;
}

export interface SensorDataStreamRow {
  clientId: string;
  displayName?: string;
  deviceType?: string;
  topic: string;
  receivedAt: string;
  collectedAt?: string;
  sequence?: number;
  measurement: string;
  payloadPreview: string;
  payload: Record<string, unknown>;
}

export interface SensorDataStreamSnapshot {
  rows: SensorDataStreamRow[];
  totalSamples: number;
  clientCount: number;
  topicCount: number;
  clients: string[];
  topics: string[];
}

export function deriveSensorTelemetrySummaries(
  clients: HubClient[],
  events: StreamEvent[],
  nowIso = new Date().toISOString(),
): SensorTelemetrySummary[] {
  const sensorClients = clients.filter(isSensorClient);
  const sensorClientIds = new Set<string>(sensorClients.map((client) => client.clientId));
  const clientsById = new Map<string, HubClient>(sensorClients.map((client) => [client.clientId, client]));
  const eventGroups = new Map<string, StreamEvent[]>();

  for (const event of events) {
    const clientId = event.envelope.clientId || readString(event.envelope.payload?.device);
    if (!clientId) {
      continue;
    }
    if (!isSensorTelemetryEvent(event, sensorClientIds)) {
      continue;
    }
    const group = eventGroups.get(clientId);
    if (group) {
      group.push(event);
    } else {
      eventGroups.set(clientId, [event]);
    }
  }

  const ids = new Set<string>(sensorClientIds);
  for (const clientId of eventGroups.keys()) {
    ids.add(clientId);
  }

  const nowTime = Date.parse(nowIso);
  return Array.from(ids).map((clientId) => {
    const client = clientsById.get(clientId);
    const samples = [...(eventGroups.get(clientId) ?? [])].sort(
      (left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt),
    );
    const latest = samples[0];
    if (!latest) {
      return {
        clientId,
        device: client?.displayName ?? client?.deviceType,
        ibiSampleCount: 0,
        sampleCount: 0,
        signalState: "unknown",
      };
    }

    const payload = latest.envelope.payload;
    const lastReceivedAt = latest.receivedAt;
    const lastSampleAgeMs = Math.max(0, nowTime - Date.parse(lastReceivedAt));
    const rrMs = readNumber(payload?.rrMs);
    const bpm = resolveBpm(readNumber(payload?.bpm), rrMs);
    const hrStatus = readNumber(payload?.hrStatus);
    const ibiMs = Array.isArray(payload?.ibiMs) ? payload.ibiMs : [];

    return {
      clientId,
      device: client?.displayName ?? client?.deviceType ?? readString(payload?.device),
      source: readString(payload?.source),
      topic: latest.envelope.topic ?? undefined,
      bpm: typeof bpm === "number" ? Math.round(bpm) : undefined,
      rrMs: typeof rrMs === "number" ? roundOneDecimal(rrMs) : undefined,
      ibiSampleCount: ibiMs.length,
      hrStatus,
      sequence: readNumber(payload?.sequence),
      lastReceivedAt,
      lastSampleAgeMs,
      sampleCount: samples.length,
      samplesPerMinute: calculateSamplesPerMinute(samples),
      signalState: deriveSignalState(lastSampleAgeMs, bpm, hrStatus),
    };
  });
}

export function deriveSensorDataStream(
  clients: HubClient[],
  events: StreamEvent[],
  limit = 30,
): SensorDataStreamSnapshot {
  const sensorClients = clients.filter(isSensorClient);
  const sensorClientIds = new Set<string>(sensorClients.map((client) => client.clientId));
  const clientsById = new Map<string, HubClient>(clients.map((client) => [client.clientId, client]));
  const rows: SensorDataStreamRow[] = [];

  for (const event of events) {
    if (event.envelope.type !== "publish" || !event.envelope.payload) {
      continue;
    }
    if (!isSensorTelemetryEvent(event, sensorClientIds, clientsById)) {
      continue;
    }

    const clientId = event.envelope.clientId || readString(event.envelope.payload.device);
    if (!clientId) {
      continue;
    }
    const client = clientsById.get(clientId);
    const payload = event.envelope.payload;

    rows.push({
      clientId,
      displayName: client?.displayName ?? readString(payload.displayName) ?? readString(payload.device),
      deviceType: client?.deviceType ?? readString(payload.deviceType) ?? readString(payload.sensorType),
      topic: event.envelope.topic ?? "unscoped.sensor",
      receivedAt: event.receivedAt,
      collectedAt: event.envelope.collectedAt ?? undefined,
      sequence: readNumber(payload.sequence),
      measurement: summarizeSensorMeasurement(payload),
      payloadPreview: summarizeGenericPayload(payload),
      payload,
    });
  }

  const sortedRows = rows.sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt));
  const limitedRows = sortedRows.slice(0, Math.max(0, limit));
  const clientIds = Array.from(new Set(sortedRows.map((row) => row.clientId))).sort();
  const topics = Array.from(new Set(sortedRows.map((row) => row.topic))).sort();

  return {
    rows: limitedRows,
    totalSamples: sortedRows.length,
    clientCount: clientIds.length,
    topicCount: topics.length,
    clients: clientIds,
    topics,
  };
}

export function serializeSensorDataStreamJson(
  snapshot: SensorDataStreamSnapshot,
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify(
    {
      exportedAt,
      kind: "biofeedback.sensor-data-stream",
      summary: {
        totalSamples: snapshot.totalSamples,
        clientCount: snapshot.clientCount,
        topicCount: snapshot.topicCount,
        clients: snapshot.clients,
        topics: snapshot.topics,
      },
      samples: snapshot.rows,
    },
    null,
    2,
  );
}

export function sensorSignalTone(signalState: SensorSignalState): "ok" | "warn" | "error" | "muted" {
  if (signalState === "streaming") {
    return "ok";
  }
  if (signalState === "stale") {
    return "warn";
  }
  if (signalState === "poor") {
    return "error";
  }
  return "muted";
}

export function sensorSignalLabel(signalState: SensorSignalState): string {
  if (signalState === "streaming") {
    return "Streaming";
  }
  if (signalState === "stale") {
    return "Stale";
  }
  if (signalState === "poor") {
    return "Poor signal";
  }
  return "No samples yet";
}

export function formatSensorAge(ageMs: number | undefined): string {
  if (typeof ageMs !== "number") {
    return "--";
  }
  if (ageMs < 1000) {
    return "now";
  }
  if (ageMs < 60000) {
    return `${Math.round(ageMs / 1000)}s ago`;
  }
  return `${Math.round(ageMs / 60000)}m ago`;
}

function deriveSignalState(ageMs: number, bpm: number | undefined, hrStatus: number | undefined): SensorSignalState {
  if (ageMs > STREAMING_MAX_AGE_MS) {
    return "stale";
  }
  if (typeof hrStatus === "number" && hrStatus < 0) {
    return "poor";
  }
  if ((typeof bpm !== "number" || bpm <= 0) && typeof hrStatus === "number" && hrStatus <= 0) {
    return "poor";
  }
  return "streaming";
}

function isSensorTelemetryEvent(
  event: StreamEvent,
  sensorClientIds: Set<string>,
  clientsById = new Map<string, HubClient>(),
): boolean {
  const clientId = event.envelope.clientId || readString(event.envelope.payload?.device);
  const client = clientId ? clientsById.get(clientId) : undefined;
  return Boolean(
    clientId &&
      (sensorClientIds.has(clientId) ||
        event.envelope.topic === HRV_RAW_TOPIC ||
        isSensorClient(client) ||
        hasSensorTopic(event.envelope.topic) ||
        hasSensorPayload(event.envelope.payload)),
  );
}

function isSensorClient(client: HubClient | undefined): boolean {
  if (!client) {
    return false;
  }
  const role = client.role.toLowerCase();
  if (role === "sensor" || role.includes("sensor")) {
    return true;
  }
  if (hasSensorText(client.deviceType)) {
    return true;
  }
  return client.capabilities.some((capability) => hasSensorText(capability));
}

function hasSensorTopic(topic: string | null | undefined): boolean {
  return hasSensorText(topic);
}

function hasSensorText(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return SENSOR_TOPIC_HINTS.some((hint) => normalized.includes(hint));
}

function hasSensorPayload(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) {
    return false;
  }
  if (SENSOR_PAYLOAD_KEYS.some((key) => key in payload)) {
    return true;
  }
  return "value" in payload && ("unit" in payload || "sensorId" in payload || "sensorType" in payload || "device" in payload);
}

function summarizeSensorMeasurement(payload: Record<string, unknown>): string {
  const bpm = readNumber(payload.bpm);
  const rrMs = readNumber(payload.rrMs);
  const hrStatus = readNumber(payload.hrStatus);
  if (typeof bpm === "number" || typeof rrMs === "number" || Array.isArray(payload.ibiMs)) {
    const parts: string[] = [];
    if (typeof bpm === "number") {
      parts.push(`${Math.round(bpm)} BPM`);
    }
    if (typeof rrMs === "number") {
      parts.push(`${roundOneDecimal(rrMs)} ms RR`);
    }
    if (Array.isArray(payload.ibiMs)) {
      parts.push(`${payload.ibiMs.length} IBI`);
    }
    if (typeof hrStatus === "number") {
      parts.push(`status ${hrStatus}`);
    }
    return parts.join(" / ");
  }

  const value = readPrimitive(payload.value);
  const unit = readString(payload.unit);
  if (typeof value !== "undefined") {
    return `${formatPrimitive(value)}${unit ? ` ${unit}` : ""}`;
  }

  const x = readNumber(payload.x);
  const y = readNumber(payload.y);
  const z = readNumber(payload.z);
  if (typeof x === "number" || typeof y === "number" || typeof z === "number") {
    return [`x ${formatMaybeNumber(x)}`, `y ${formatMaybeNumber(y)}`, `z ${formatMaybeNumber(z)}`].join(" / ");
  }

  const arrayEntry = Object.entries(payload).find(([, item]) => Array.isArray(item));
  if (arrayEntry && Array.isArray(arrayEntry[1])) {
    return `${arrayEntry[0]} ${arrayEntry[1].length} samples`;
  }

  return summarizeGenericPayload(payload);
}

function summarizeGenericPayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (parts.length >= 4) {
      break;
    }
    const primitive = readPrimitive(value);
    if (typeof primitive !== "undefined") {
      parts.push(`${key}: ${formatPrimitive(primitive)}`);
      continue;
    }
    if (Array.isArray(value)) {
      parts.push(`${key}: ${value.length} samples`);
    }
  }
  return parts.length > 0 ? parts.join("; ") : JSON.stringify(payload);
}

function calculateSamplesPerMinute(samples: StreamEvent[]): number | undefined {
  if (samples.length < 2) {
    return undefined;
  }
  const newest = Date.parse(samples[0].receivedAt);
  const oldest = Date.parse(samples[samples.length - 1].receivedAt);
  const spanMs = newest - oldest;
  if (spanMs <= 0) {
    return undefined;
  }
  return Math.round(samples.length / (spanMs / 60000));
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPrimitive(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function formatPrimitive(value: string | number | boolean): string {
  if (typeof value === "number") {
    return String(roundOneDecimal(value));
  }
  return String(value);
}

function formatMaybeNumber(value: number | undefined): string {
  return typeof value === "number" ? String(roundOneDecimal(value)) : "--";
}

function resolveBpm(bpm: number | undefined, rrMs: number | undefined): number | undefined {
  if (typeof bpm === "number" && bpm > 0) {
    return bpm;
  }
  if (typeof rrMs === "number" && rrMs > 0) {
    return 60000 / rrMs;
  }
  return bpm;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
