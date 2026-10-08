import type { HubClient, StreamEvent } from "./types";

const HRV_RAW_TOPIC = "hrv.raw";
const STREAMING_MAX_AGE_MS = 5000;
const HEART_METRIC_HOLD_MAX_AGE_MS = STREAMING_MAX_AGE_MS;
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
  collectedAt?: string;
  hubReceivedAt?: string;
  lastSampleAgeMs?: number;
  browserAgeMs?: number;
  hubAgeMs?: number;
  transportDelayMs?: number;
  sequenceGapCount?: number;
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
  hubReceivedAt?: string;
  browserAgeMs?: number;
  transportDelayMs?: number;
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

export interface ManagedSensorLabel {
  sensorId: string;
  displayName?: string;
  deviceType?: string;
}

export function deriveSensorTelemetrySummaries(
  clients: HubClient[],
  events: StreamEvent[],
  nowIso = new Date().toISOString(),
): SensorTelemetrySummary[] {
  const sensorClients = clients.filter(isSensorClient);
  const sensorClientIds = new Set<string>(sensorClients.map((client) => client.clientId));
  const clientsById = new Map<string, HubClient>(clients.map((client) => [client.clientId, client]));
  const eventGroups = new Map<string, StreamEvent[]>();

  for (const event of events) {
    const clientId = sensorIdentityForEvent(event);
    if (!clientId) {
      continue;
    }
    if (!isSensorTelemetryEvent(event, sensorClientIds, clientsById)) {
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
        sequenceGapCount: 0,
        sampleCount: 0,
        signalState: "unknown",
      };
    }

    const payload = latest.envelope.payload;
    const lastReceivedAt = latest.receivedAt;
    const collectedAt = latest.envelope.collectedAt ?? undefined;
    const hubReceivedAt = latest.envelope.hubReceivedAt ?? undefined;
    const browserAgeMs = ageFromTimestamp(lastReceivedAt, nowTime);
    const hubAgeMs = ageFromTimestamp(hubReceivedAt, nowTime);
    // The driver clock can be ahead or stale. Use Hub receipt for freshness;
    // retain source and browser ages separately for transport diagnostics.
    const lastSampleAgeMs = ageFromTimestamp(hubReceivedAt ?? lastReceivedAt, nowTime) ?? 0;
    const transportDelayMs = elapsedBetween(collectedAt, hubReceivedAt);
    const heartMetrics = resolveRecentHeartMetrics(samples, nowTime, lastSampleAgeMs);
    const rrMs = heartMetrics.rrMs;
    const bpm = heartMetrics.bpm;
    const latestRrMs = readNumber(payload?.rrMs);
    const latestBpm = resolveBpm(readNumber(payload?.bpm), latestRrMs);
    const hrStatus = readNumber(payload?.hrStatus);
    const ibiMs = Array.isArray(payload?.ibiMs) ? payload.ibiMs : [];

    return {
      clientId,
      device:
        client?.displayName
        ?? client?.deviceType
        ?? readString(payload?.displayName)
        ?? readString(payload?.deviceType)
        ?? readString(payload?.device),
      source: readString(payload?.source),
      topic: latest.envelope.topic ?? undefined,
      bpm: typeof bpm === "number" ? Math.round(bpm) : undefined,
      rrMs: typeof rrMs === "number" ? roundOneDecimal(rrMs) : undefined,
      ibiSampleCount: ibiMs.length,
      hrStatus,
      sequence: readNumber(payload?.sequence),
      lastReceivedAt,
      collectedAt,
      hubReceivedAt,
      lastSampleAgeMs,
      browserAgeMs,
      hubAgeMs,
      transportDelayMs,
      sequenceGapCount: countSequenceGaps(samples),
      sampleCount: samples.length,
      samplesPerMinute: calculateSamplesPerMinute(samples),
      signalState: deriveSignalState(lastSampleAgeMs, latestBpm, hrStatus),
    };
  });
}

export function deriveSensorDataStream(
  clients: HubClient[],
  events: StreamEvent[],
  limit = 30,
  managedSensors: ManagedSensorLabel[] = [],
): SensorDataStreamSnapshot {
  const sensorClients = clients.filter(isSensorClient);
  const sensorClientIds = new Set<string>(sensorClients.map((client) => client.clientId));
  const clientsById = new Map<string, HubClient>(clients.map((client) => [client.clientId, client]));
  const managedSensorsById = new Map(managedSensors.map((sensor) => [sensor.sensorId, sensor]));
  const rows: SensorDataStreamRow[] = [];

  for (const event of events) {
    if (event.envelope.type !== "publish" || !event.envelope.payload) {
      continue;
    }
    if (!isSensorTelemetryEvent(event, sensorClientIds, clientsById)) {
      continue;
    }

    const clientId = sensorIdentityForEvent(event);
    if (!clientId) {
      continue;
    }
    const transportClient = clientsById.get(event.envelope.clientId);
    const client = isSensorManagerClient(transportClient)
      ? clientsById.get(clientId)
      : transportClient ?? clientsById.get(clientId);
    const managedSensor = managedSensorsById.get(clientId);
    const payload = event.envelope.payload;

    rows.push({
      clientId,
      displayName:
        readString(payload.displayName)
        ?? readString(payload.device)
        ?? readString(payload.deviceType),
      deviceType:
        readString(payload.deviceType)
        ?? readString(payload.sensorType)
        ?? managedSensor?.deviceType
        ?? client?.deviceType,
      topic: event.envelope.topic ?? "unscoped.sensor",
      receivedAt: event.receivedAt,
      collectedAt: event.envelope.collectedAt ?? undefined,
      hubReceivedAt: event.envelope.hubReceivedAt ?? undefined,
      browserAgeMs: ageFromTimestamp(event.receivedAt, Date.now()),
      transportDelayMs: elapsedBetween(event.envelope.collectedAt, event.envelope.hubReceivedAt),
      sequence: readNumber(payload.sequence),
      measurement: summarizeSensorMeasurement(payload),
      payloadPreview: summarizeGenericPayload(payload),
      payload,
    });

    const row = rows[rows.length - 1];
    row.displayName = row.displayName ?? managedSensor?.displayName ?? client?.displayName;
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
    return "Transmitindo";
  }
  if (signalState === "stale") {
    return "Sem atualização";
  }
  if (signalState === "poor") {
    return "Sinal ruim";
  }
  return "Sem amostras";
}

export function formatSensorAge(ageMs: number | undefined): string {
  if (typeof ageMs !== "number") {
    return "--";
  }
  if (ageMs < 1000) {
    return "agora";
  }
  if (ageMs < 60000) {
    return `há ${Math.round(ageMs / 1000)} s`;
  }
  return `há ${Math.round(ageMs / 60000)} min`;
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
  if (isSensorManagerControlTopic(event.envelope.topic)) {
    return false;
  }
  const transportClientId = event.envelope.clientId;
  const clientId = sensorIdentityForEvent(event);
  const client = transportClientId ? clientsById.get(transportClientId) : undefined;
  if (isSensorManagerClient(client) && !isManagedSensorDataTopic(event.envelope.topic)) {
    return false;
  }
  return Boolean(
    clientId &&
      (sensorClientIds.has(clientId) ||
        event.envelope.topic === HRV_RAW_TOPIC ||
        isSensorClient(client) ||
        hasSensorTopic(event.envelope.topic) ||
        hasSensorPayload(event.envelope.payload)),
  );
}

function isSensorManagerControlTopic(topic: string | null | undefined): boolean {
  return topic === "sensor.status" || topic === "sensor.preview" || topic === "sensor.session" || topic === "sensor.commands";
}

export function isSensorClient(client: HubClient | undefined): boolean {
  if (!client) {
    return false;
  }
  if (isSensorManagerClient(client)) {
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

function sensorIdentityForEvent(event: StreamEvent): string | undefined {
  const transportClientId = event.envelope.clientId;
  if (isManagedSensorDataTopic(event.envelope.topic)) {
    return readString(event.envelope.payload?.sensorId) ?? transportClientId;
  }
  return transportClientId || readString(event.envelope.payload?.device);
}

function isManagedSensorDataTopic(topic: string | null | undefined): boolean {
  return topic === "hrv.raw" || topic === "lsl.raw";
}

export function formatSensorDelay(delayMs: number | undefined): string {
  if (typeof delayMs !== "number" || !Number.isFinite(delayMs)) {
    return "--";
  }
  if (delayMs < 1000) {
    return `${Math.round(delayMs)} ms`;
  }
  return `${(delayMs / 1000).toFixed(1)} s`;
}

function isSensorManagerClient(client: HubClient | undefined): boolean {
  return Boolean(
    client?.capabilities.some((capability) => capability.toLowerCase() === "sensor-manager"),
  );
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

function countSequenceGaps(samples: StreamEvent[]): number {
  const sequences = samples
    .map((sample) => readNumber(sample.envelope.payload?.sequence))
    .filter((sequence): sequence is number => typeof sequence === "number")
    .reverse();
  let gaps = 0;
  for (let index = 1; index < sequences.length; index += 1) {
    const previous = sequences[index - 1];
    const current = sequences[index];
    if (current < previous) {
      // A lower sequence starts a new acquisition epoch after reconnect.
      continue;
    }
    if (current > previous + 1) {
      gaps += current - previous - 1;
    }
  }
  return gaps;
}

function ageFromTimestamp(timestamp: string | undefined, nowTime: number): number | undefined {
  if (!timestamp) {
    return undefined;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? Math.max(0, nowTime - parsed) : undefined;
}

function elapsedBetween(earlier: string | null | undefined, later: string | null | undefined): number | undefined {
  if (!earlier || !later) {
    return undefined;
  }
  const start = Date.parse(earlier);
  const end = Date.parse(later);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }
  return Math.max(0, end - start);
}

function resolveRecentHeartMetrics(
  samples: StreamEvent[],
  nowTime: number,
  latestSampleAgeMs: number,
): { bpm?: number; rrMs?: number } {
  if (latestSampleAgeMs > STREAMING_MAX_AGE_MS) {
    return {};
  }

  return {
    bpm: resolveRecentHeartMetric(samples, nowTime, (payload) => {
      const rrMs = readPositiveNumber(payload?.rrMs);
      return resolveBpm(readPositiveNumber(payload?.bpm), rrMs);
    }),
    rrMs: resolveRecentHeartMetric(samples, nowTime, (payload) => readPositiveNumber(payload?.rrMs)),
  };
}

function resolveRecentHeartMetric(
  samples: StreamEvent[],
  nowTime: number,
  readMetric: (payload: Record<string, unknown> | undefined) => number | undefined,
): number | undefined {
  const metricSampleIndex = samples.findIndex(
    (sample) => typeof readMetric(sample.envelope.payload) === "number",
  );
  if (metricSampleIndex < 0) {
    return undefined;
  }
  if (metricSampleIndex > 0 && !canHoldHeartMetric(samples, metricSampleIndex, nowTime)) {
    return undefined;
  }
  return readMetric(samples[metricSampleIndex].envelope.payload);
}

function canHoldHeartMetric(samples: StreamEvent[], metricSampleIndex: number, nowTime: number): boolean {
  const metricSampleTime = Date.parse(samples[metricSampleIndex].receivedAt);
  if (!Number.isFinite(metricSampleTime) || nowTime - metricSampleTime > HEART_METRIC_HOLD_MAX_AGE_MS) {
    return false;
  }

  for (let index = 0; index <= metricSampleIndex; index += 1) {
    const payload = samples[index].envelope.payload;
    if (!hasEcgSamples(payload) || isExplicitPoorSignal(payload)) {
      return false;
    }
    if (index === metricSampleIndex) {
      continue;
    }

    const newerSequence = readNumber(payload?.sequence);
    const olderSequence = readNumber(samples[index + 1].envelope.payload?.sequence);
    if (typeof newerSequence !== "number" || typeof olderSequence !== "number" || newerSequence <= olderSequence) {
      return false;
    }
  }
  return true;
}

function hasEcgSamples(payload: Record<string, unknown> | undefined): boolean {
  return Array.isArray(payload?.ecg) && payload.ecg.length > 0;
}

function isExplicitPoorSignal(payload: Record<string, unknown> | undefined): boolean {
  const hrStatus = readNumber(payload?.hrStatus);
  if (typeof hrStatus !== "number") {
    return false;
  }
  if (hrStatus < 0) {
    return true;
  }
  const rrMs = readPositiveNumber(payload?.rrMs);
  const bpm = resolveBpm(readPositiveNumber(payload?.bpm), rrMs);
  return hrStatus <= 0 && typeof bpm !== "number";
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
  const number = readNumber(value);
  return typeof number === "number" && number > 0 ? number : undefined;
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
