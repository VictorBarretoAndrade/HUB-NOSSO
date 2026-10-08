import type { ExperienceRunState } from "./experienceRun";
import { isSensorClient } from "./sensorTelemetry";
import type {
  LslChannelMetadata,
  LslStreamMetadata,
  LslSyncMetadata,
  ManagedSensorState,
  ManagedSensorStatus,
  SensorProviderState,
  StatusResponse,
  StreamEvent,
} from "./types";

export const SENSOR_PREVIEW_MAX_AGE_MS = 5000;
const SENSOR_TOPICS_EXCLUDED_FROM_LIVE_MONITOR = new Set(["lsl.raw"]);

export interface ManagedSensorView {
  sensorId: string;
  adapterId: string;
  providerId?: string | null;
  source: string;
  displayName: string;
  deviceType: string;
  topics: string[];
  state: ManagedSensorState;
  armedForNextRun: boolean;
  attachedRunId?: string | null;
  quality?: string;
  lastSampleAt?: string | null;
  lastStatusAt?: string | null;
  lastError?: string | null;
  recordingGateOpen?: boolean;
  staleAfterMs?: number | null;
  previewReceivedAt?: string;
  previewAgeMs?: number;
  previewSample?: Record<string, unknown>;
  previewSummary: string;
  lslMetadata?: LslStreamMetadata;
  lslSync?: LslSyncMetadata;
}

export interface SensorProviderView {
  providerId: string;
  displayName: string;
  state: SensorProviderState;
  discoveredCount: number;
  supportedCount: number;
  unsupportedCount: number;
  lastScanAt?: string | null;
  detail?: string;
}

export interface LslSensorDetails {
  name: string;
  type: string;
  channels: string;
  rate: string;
  origin: string;
  sync: string;
  format?: string;
  channelSummary?: string;
}

export interface SensorActionAvailability {
  scan: boolean;
  connect: boolean;
  disconnect: boolean;
  arm: boolean;
  disarm: boolean;
  attach: boolean;
  detach: boolean;
  attachReason?: string;
}

export function deriveManagedSensors(
  status: StatusResponse | null,
  events: StreamEvent[],
  nowIso = new Date().toISOString(),
): ManagedSensorView[] {
  const sensors = new Map<string, ManagedSensorView>();
  const nowMs = Date.parse(nowIso);

  for (const sensor of status?.sensorManager?.sensors ?? []) {
    sensors.set(sensor.sensorId, viewFromStatus(sensor));
  }

  const orderedEvents = [...events].sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
  for (const event of orderedEvents) {
    if (event.envelope.topic === "sensor.status") {
      const statusView = viewFromStatusEvent(event);
      if (statusView) {
        const current = sensors.get(statusView.sensorId);
        if (!current || isNewerStatus(statusView, current)) {
          sensors.set(statusView.sensorId, {
            ...(current ?? statusView),
            ...statusView,
            previewReceivedAt: current?.previewReceivedAt,
            previewAgeMs: current?.previewAgeMs,
            previewSample: current?.previewSample,
            previewSummary: current?.previewSummary ?? statusView.previewSummary,
            lslMetadata: statusView.lslMetadata ?? current?.lslMetadata,
            lslSync: statusView.lslSync ?? current?.lslSync,
          });
        }
      }
    }
    if (event.envelope.topic === "sensor.preview") {
      const sensorId = readString(event.envelope.payload?.sensorId);
      if (!sensorId) {
        continue;
      }
      const current = sensors.get(sensorId) ?? unknownSensor(sensorId);
      const sample = readPreviewSample(event.envelope.payload?.sample);
      const previewAgeMs = Math.max(0, nowMs - Date.parse(event.receivedAt));
      const lslMetadata = readLslMetadata(
        event.envelope.payload?.stream,
        event.envelope.payload?.metadata,
        sample.stream,
        sample.metadata,
        current.lslMetadata,
      );
      const lslSync = readLslSyncMetadata(
        event.envelope.payload?.sync,
        sample.sync,
        current.lslSync,
      );
      sensors.set(sensorId, {
        ...current,
        lastSampleAt: event.envelope.collectedAt ?? event.receivedAt,
        previewReceivedAt: event.receivedAt,
        previewAgeMs,
        previewSample: sample,
        previewSummary: summarizePreviewSample(sample),
        lslMetadata,
        lslSync,
      });
    }
  }

  return Array.from(sensors.values())
    .map((sensor) => ({
      ...sensor,
      state: deriveDisplayedState(sensor),
      previewSummary: sensor.previewSummary || "--",
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function deriveSensorProviders(status: StatusResponse | null): SensorProviderView[] {
  return (status?.sensorManager?.providers ?? [])
    .map((provider) => ({
      providerId: provider.providerId,
      displayName: provider.providerId.toLowerCase() === "lsl" ? "LSL" : provider.providerId,
      state: provider.state,
      discoveredCount: readNonNegativeInteger(provider.discoveredCount),
      supportedCount: readNonNegativeInteger(provider.supportedCount),
      unsupportedCount: readNonNegativeInteger(provider.unsupportedCount),
      lastScanAt: provider.lastScanAt,
      detail: provider.error ?? provider.reason ?? undefined,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function sensorProviderStateTone(state: SensorProviderState): "ok" | "warn" | "error" | "muted" {
  if (state === "ready") return "ok";
  if (state === "unavailable") return "warn";
  if (state === "error") return "error";
  return "muted";
}

export function sensorProviderStateLabel(state: SensorProviderState): string {
  if (state === "ready") return "Pronto";
  if (state === "unavailable") return "Indisponível";
  if (state === "disabled") return "Desativado";
  return "Erro";
}

export function deriveLslSensorDetails(sensor: ManagedSensorView): LslSensorDetails | null {
  if (!isLslSensor(sensor)) {
    return null;
  }
  const metadata = sensor.lslMetadata ?? {};
  const channelCount = metadata.channelCount ?? metadata.channels?.length ?? metadata.labels?.length;
  return {
    name: metadata.name ?? sensor.displayName,
    type: metadata.type ?? sensor.deviceType,
    channels: typeof channelCount === "number" ? String(channelCount) : "--",
    rate: formatLslRate(metadata.nominalSrateHz),
    origin: metadata.sourceId ?? metadata.uid ?? metadata.host ?? metadata.hostname ?? "--",
    sync: formatLslSync(sensor.lslSync),
    format: metadata.channelFormat,
    channelSummary: formatLslChannels(metadata),
  };
}

export function sensorPublishTopics(status: StatusResponse): string[] {
  const topics = new Set<string>();
  for (const sensor of status.sensorManager?.sensors ?? []) {
    addTopicList(topics, sensor.topics);
  }
  for (const client of status.clients) {
    const metadata = client.metadata ?? {};
    if (!isSensorClient(client) && !hasDeclaredTopics(metadata)) {
      continue;
    }
    addTopicValue(topics, metadata.contract);
    addTopicValue(topics, metadata.topic);
    addTopicList(topics, metadata.topics);
  }
  return Array.from(topics)
    .filter((topic) => !SENSOR_TOPICS_EXCLUDED_FROM_LIVE_MONITOR.has(topic))
    .sort();
}

export function sensorStateTone(state: ManagedSensorState): "ok" | "warn" | "error" | "muted" {
  if (state === "recording" || state === "connected") return "ok";
  if (state === "connecting" || state === "available" || state === "stale") return "warn";
  if (state === "error") return "error";
  return "muted";
}

export function sensorStateLabel(state: ManagedSensorState): string {
  if (state === "configured") return "Configurado";
  if (state === "available") return "Disponível";
  if (state === "connecting") return "Conectando";
  if (state === "connected") return "Conectado";
  if (state === "recording") return "Gravando";
  if (state === "stale") return "Sem atualização";
  if (state === "error") return "Erro";
  return "Desconectado";
}

export function sensorActionAvailability(
  sensor: ManagedSensorView,
  run: Pick<ExperienceRunState, "runId" | "status">,
  pending = false,
): SensorActionAvailability {
  const runIsActive = (run.status === "running" || run.status === "paused") && Boolean(run.runId);
  const previewFresh = typeof sensor.previewAgeMs === "number" && sensor.previewAgeMs <= SENSOR_PREVIEW_MAX_AGE_MS;
  const hasAttachedRun = Boolean(sensor.attachedRunId);
  const canConnect = !hasAttachedRun && ["configured", "available", "disconnected", "error"].includes(sensor.state);
  const operational = sensor.state === "connected" || sensor.state === "stale";
  const canDisconnect = !hasAttachedRun && !sensor.armedForNextRun && ["connecting", "connected", "stale"].includes(sensor.state);
  const canArm = !hasAttachedRun && !runIsActive && !sensor.armedForNextRun && operational && (previewFresh || sensor.state === "stale");
  const canAttach = !hasAttachedRun && runIsActive && !sensor.armedForNextRun && operational && (previewFresh || sensor.state === "stale");
  let attachReason: string | undefined;
  if (sensor.armedForNextRun) {
    attachReason = "O sensor já está armado para a próxima experiência.";
  } else if (sensor.state !== "connected" && sensor.state !== "stale") {
    attachReason = "Conecte o sensor primeiro.";
  } else if (!previewFresh) {
    attachReason = "Aguardando um preview recente do sensor.";
  }
  return {
    scan: !pending,
    connect: canConnect && !pending,
    disconnect: canDisconnect && !pending,
    arm: canArm && !pending,
    disarm: !runIsActive && sensor.armedForNextRun && !pending,
    attach: canAttach && !pending,
    detach: hasAttachedRun && !pending,
    attachReason,
  };
}

export function hasSensorManager(status: StatusResponse | null): boolean {
  return Boolean(status?.sensorManager);
}

export function hasOfficialLslRecording(sensors: ManagedSensorView[]): boolean {
  return sensors.some(
    (sensor) =>
      Boolean(sensor.attachedRunId) &&
      sensor.recordingGateOpen === true &&
      (sensor.state === "recording" || sensor.state === "stale") &&
      sensor.topics.includes("lsl.raw"),
  );
}

function viewFromStatus(sensor: ManagedSensorStatus): ManagedSensorView {
  const lslMetadata = readLslMetadata(
    sensor.stream,
    sensor.metadata?.lsl,
    sensor.metadata?.stream,
    sensor.adapterStatus?.stream,
    sensor.adapterStatus?.metadata,
    sensor.source === "lsl" ? sensor.metadata : undefined,
    sensor.source === "lsl" ? sensor.adapterStatus : undefined,
  );
  const lslSync = readLslSyncMetadata(
    sensor.sync,
    sensor.metadata?.sync,
    sensor.adapterStatus?.sync,
  );
  return {
    sensorId: sensor.sensorId,
    adapterId: sensor.adapterId,
    providerId: sensor.providerId,
    source: sensor.source,
    displayName: sensor.displayName ?? sensor.sensorId,
    deviceType: sensor.deviceType ?? "--",
    topics: sensor.topics ?? [],
    state: sensor.state,
    armedForNextRun: sensor.armedForNextRun ?? false,
    attachedRunId: sensor.attachedRunId,
    quality: sensor.quality,
    lastSampleAt: sensor.lastSampleAt,
    lastStatusAt: sensor.lastStatusAt,
    lastError: sensor.lastError,
    recordingGateOpen: sensor.recordingGateOpen,
    staleAfterMs: sensor.freshness?.staleAfterMs,
    previewSummary: "--",
    lslMetadata,
    lslSync,
  };
}

function viewFromStatusEvent(event: StreamEvent): ManagedSensorView | null {
  const payload = event.envelope.payload ?? {};
  const sensorId = readString(payload.sensorId);
  if (!sensorId) {
    return null;
  }
  const state = readSensorState(payload.state);
  const source = readString(payload.source) ?? "--";
  const metadata = readRecord(payload.metadata);
  const adapterStatus = readRecord(payload.adapterStatus);
  const freshness = readRecord(payload.freshness);
  return {
    sensorId,
    adapterId: readString(payload.adapterId) ?? "--",
    providerId: readString(payload.providerId),
    source,
    displayName: readString(payload.displayName) ?? sensorId,
    deviceType: readString(payload.deviceType) ?? "--",
    topics: readStringArray(payload.topics),
    state,
    armedForNextRun: payload.armedForNextRun === true,
    attachedRunId: readString(payload.attachedRunId),
    quality: readString(payload.quality),
    lastSampleAt: readString(payload.lastSampleAt),
    lastStatusAt: event.receivedAt,
    lastError: readString(payload.error),
    recordingGateOpen: payload.recordingGateOpen === true,
    staleAfterMs: readNullableNumber(freshness?.staleAfterMs),
    previewSummary: "--",
    lslMetadata: readLslMetadata(
      payload.stream,
      metadata?.lsl,
      metadata?.stream,
      adapterStatus?.stream,
      adapterStatus?.metadata,
      source === "lsl" ? metadata : undefined,
      source === "lsl" ? adapterStatus : undefined,
    ),
    lslSync: readLslSyncMetadata(payload.sync, metadata?.sync, adapterStatus?.sync),
  };
}

function unknownSensor(sensorId: string): ManagedSensorView {
  return {
    sensorId,
    adapterId: "--",
    source: "--",
    displayName: sensorId,
    deviceType: "--",
    topics: [],
    state: "connected",
    armedForNextRun: false,
    previewSummary: "--",
  };
}

function deriveDisplayedState(sensor: ManagedSensorView): ManagedSensorState {
  if (sensor.state !== "connected" && sensor.state !== "recording") {
    return sensor.state;
  }
  const staleAfterMs = sensor.staleAfterMs === undefined ? SENSOR_PREVIEW_MAX_AGE_MS : sensor.staleAfterMs;
  if (
    typeof staleAfterMs === "number" &&
    typeof sensor.previewAgeMs === "number" &&
    sensor.previewAgeMs > staleAfterMs
  ) {
    return "stale";
  }
  return sensor.state;
}

function isNewerStatus(next: ManagedSensorView, current: ManagedSensorView): boolean {
  const nextTime = Date.parse(next.lastStatusAt ?? "");
  const currentTime = Date.parse(current.lastStatusAt ?? "");
  if (Number.isNaN(currentTime)) {
    return true;
  }
  if (Number.isNaN(nextTime)) {
    return false;
  }
  return nextTime >= currentTime;
}

function summarizePreviewSample(sample: Record<string, unknown>): string {
  const bpm = readNumber(sample.bpm);
  const rrMs = readNumber(sample.rrMs);
  const quality = readString(sample.quality);
  const parts: string[] = [];
  if (typeof bpm === "number") parts.push(`${Math.round(bpm)} bpm`);
  if (typeof rrMs === "number") parts.push(`${Math.round(rrMs * 10) / 10} ms RR`);
  if (quality) parts.push(quality);
  if (parts.length > 0) {
    return parts.join(" / ");
  }
  const values = readNumberArray(sample.values);
  if (values.length > 0) {
    const shown = values.slice(0, 4).map(formatPreviewValue).join(" / ");
    const remainder = values.length > 4 ? ` / +${values.length - 4}` : "";
    return `${values.length} ch: ${shown}${remainder}`;
  }
  const value = readNumber(sample.value);
  if (typeof value === "number") {
    return formatPreviewValue(value);
  }
  return JSON.stringify(sample).slice(0, 80);
}

function readPreviewSample(value: unknown): Record<string, unknown> {
  const record = readRecord(value);
  if (record) {
    return record;
  }
  if (Array.isArray(value)) {
    return { values: value };
  }
  return {};
}

function readLslMetadata(...candidates: unknown[]): LslStreamMetadata | undefined {
  const result: LslStreamMetadata = {};
  for (const candidate of candidates) {
    const record = readRecord(candidate);
    if (!record) {
      continue;
    }
    const records = [record];
    const nestedStream = readRecord(record.stream);
    if (nestedStream) {
      records.unshift(nestedStream);
    }
    for (const source of records) {
      result.name ??= readString(source.name) ?? readString(source.streamName);
      result.type ??= readString(source.type) ?? readString(source.streamType);
      result.uid ??= readString(source.uid);
      result.sourceId ??= readString(source.sourceId) ?? readString(source.source_id);
      result.host ??= readString(source.host);
      result.hostname ??= readString(source.hostname);
      result.channelCount ??= readNumber(source.channelCount) ?? readNumber(source.channel_count);
      result.nominalSrateHz ??=
        readNumber(source.nominalSrateHz) ?? readNumber(source.nominalSrate) ?? readNumber(source.nominal_srate);
      result.channelFormat ??= readString(source.channelFormat) ?? readString(source.channel_format);
      result.channels ??= readLslChannels(source.channels);
      const labels = readStringArray(source.labels);
      const units = readStringArray(source.units);
      if (labels.length > 0) result.labels ??= labels;
      if (units.length > 0) result.units ??= units;
    }
  }
  return hasLslMetadata(result) ? result : undefined;
}

function readLslSyncMetadata(...candidates: unknown[]): LslSyncMetadata | undefined {
  const result: LslSyncMetadata = {};
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      result.status ??= readString(candidate);
      continue;
    }
    const record = readRecord(candidate);
    if (!record) {
      continue;
    }
    result.status ??= readString(record.status) ?? readString(record.syncStatus);
    result.timeCorrectionSec ??=
      readNumber(record.timeCorrectionSec) ?? readNumber(record.time_correction) ?? readNumber(record.correctionSec);
    result.timeCorrectionAgeSec ??= readNumber(record.timeCorrectionAgeSec);
    result.reason ??= readString(record.reason);
    result.correctionStatus ??= readString(record.correctionStatus);
    result.correctionReason ??= readString(record.correctionReason);
  }
  return result.status ||
    typeof result.timeCorrectionSec === "number" ||
    result.reason ||
    result.correctionStatus ||
    result.correctionReason
    ? result
    : undefined;
}

function readLslChannels(value: unknown): LslChannelMetadata[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const channels = value.flatMap((item, index): LslChannelMetadata[] => {
    if (typeof item === "string" && item.trim()) {
      return [{ index, label: item.trim() }];
    }
    const record = readRecord(item);
    if (!record) {
      return [];
    }
    return [{
      index: readNumber(record.index) ?? index,
      label: readString(record.label) ?? readString(record.name),
      unit: readString(record.unit),
      type: readString(record.type),
    }];
  });
  return channels.length > 0 ? channels : undefined;
}

function hasLslMetadata(metadata: LslStreamMetadata): boolean {
  return Object.values(metadata).some((value) => value !== undefined);
}

function isLslSensor(sensor: ManagedSensorView): boolean {
  return (
    sensor.source.toLowerCase() === "lsl" ||
    sensor.adapterId.toLowerCase().includes("lsl") ||
    sensor.topics.includes("lsl.raw") ||
    Boolean(sensor.lslMetadata)
  );
}

function formatLslRate(rate: number | undefined): string {
  if (typeof rate !== "number" || rate < 0) {
    return "--";
  }
  if (rate === 0) {
    return "Irregular";
  }
  return `${Math.round(rate * 100) / 100} Hz`;
}

function formatLslSync(sync: LslSyncMetadata | undefined): string {
  if (!sync) {
    return "--";
  }
  let label = sync.status ? titleCase(sync.status) : typeof sync.timeCorrectionSec === "number" ? "Corrigido" : "--";
  if (sync.correctionStatus && sync.correctionStatus !== sync.status) {
    label += ` / correção ${titleCase(sync.correctionStatus)}`;
  }
  if (typeof sync.timeCorrectionSec !== "number") {
    return label;
  }
  const correctionMs = Math.round(sync.timeCorrectionSec * 100000) / 100;
  const prefix = correctionMs > 0 ? "+" : "";
  return `${label} (${prefix}${correctionMs} ms)`;
}

function hasDeclaredTopics(metadata: Record<string, unknown>): boolean {
  return (
    typeof metadata.contract === "string" ||
    typeof metadata.topic === "string" ||
    Array.isArray(metadata.topics)
  );
}

function readNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return readNumber(value);
}

function formatLslChannels(metadata: LslStreamMetadata): string | undefined {
  const channels: LslChannelMetadata[] | undefined = metadata.channels ?? metadata.labels?.map((label, index) => ({
    index,
    label,
    unit: metadata.units?.[index],
  }));
  if (!channels || channels.length === 0) {
    return undefined;
  }
  const shown = channels.slice(0, 4).map((channel, index) => {
    const label = channel.label ?? channel.type ?? `CH${(channel.index ?? index) + 1}`;
    return channel.unit ? `${label} (${channel.unit})` : label;
  });
  if (channels.length > shown.length) {
    shown.push(`+${channels.length - shown.length}`);
  }
  return shown.join(" / ");
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPreviewValue(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

function readSensorState(value: unknown): ManagedSensorState {
  if (
    value === "configured" ||
    value === "available" ||
    value === "connecting" ||
    value === "connected" ||
    value === "recording" ||
    value === "stale" ||
    value === "error" ||
    value === "disconnected"
  ) {
    return value;
  }
  return "configured";
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

function readNonNegativeInteger(value: unknown): number {
  const number = readNumber(value);
  return typeof number === "number" && number >= 0 ? Math.floor(number) : 0;
}

function addTopicValue(topics: Set<string>, value: unknown) {
  const topic = readString(value);
  if (topic) {
    topics.add(topic);
  }
}

function addTopicList(topics: Set<string>, value: unknown) {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    addTopicValue(topics, item);
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
