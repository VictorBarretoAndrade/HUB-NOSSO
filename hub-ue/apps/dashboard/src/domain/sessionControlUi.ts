import type { ExperienceRunState } from "./experienceRun";
import { deriveLslSensorDetails, sensorStateLabel, sensorStateTone } from "./sensorManager";
import type { ManagedSensorView } from "./sensorManager";
import { sensorSignalLabel, sensorSignalTone } from "./sensorTelemetry";
import type { SensorSignalState, SensorTelemetrySummary } from "./sensorTelemetry";
import { sessionStateLabel, sessionStateTone } from "./sessionState";
import type { SessionStateSummary } from "./sessionState";

export type SessionControlTab = "operate" | "timeline" | "sensors" | "history" | "report";

export interface SessionControlTabItem {
  id: SessionControlTab;
  label: string;
  count?: number;
}

export interface RunHeaderSummary {
  experienceLabel: string;
  unrealLabel: string;
  unrealDetail: string;
  unrealTone: "ok" | "warn" | "error" | "muted";
  sensorLabel: string;
  sensorDetail: string;
  sensorTone: "ok" | "warn" | "error" | "muted";
}

export interface SensorListRow {
  id: string;
  name: string;
  signalState: SensorSignalState;
  signalLabel: string;
  bpm: string;
  rrMs: string;
  ibiSampleCount: string;
  samplesPerMinute: string;
  lastUpdate: string;
  topic: string;
}

export function summarizeRunHeader(
  run: ExperienceRunState,
  sessionState: SessionStateSummary,
  sensors: SensorTelemetrySummary[],
  managedSensors: ManagedSensorView[] = [],
): RunHeaderSummary {
  const primary = primarySensorSummary(sensors);
  const managedPrimary = primaryManagedSensor(managedSensors);
  const managedSummary = managedPrimary ? summarizeManagedSensor(managedPrimary) : null;
  const unrealState = sessionStateLabel(sessionState.state);

  return {
    experienceLabel: experienceRunLabel(run.status),
    unrealLabel: `Unreal: ${unrealState.toLowerCase()}`,
    unrealDetail: sessionState.sourceClientId
      ? `${sessionState.sourceClientId}${sessionState.receivedAt ? ` · ${formatTime(sessionState.receivedAt)}` : ""}`
      : "Nenhum unreal.state observado",
    unrealTone: sessionStateTone(sessionState.state),
    sensorLabel: managedSummary?.label ?? (primary ? `${primary.device ?? primary.clientId}: ${sensorSignalLabel(primary.signalState).toLowerCase()}` : "Sem stream de sensor"),
    sensorDetail: managedSummary?.detail ?? (primary ? `BPM ${formatInteger(primary.bpm)} / RR ${formatOneDecimal(primary.rrMs)} ms` : "Nenhuma amostra biométrica observada"),
    sensorTone: managedSummary?.tone ?? sensorSignalTone(primary?.signalState ?? "unknown"),
  };
}

export function buildSensorListRows(summaries: SensorTelemetrySummary[]): SensorListRow[] {
  return summaries.map((summary) => ({
    id: summary.clientId,
    name: summary.device ?? summary.clientId,
    signalState: summary.signalState,
    signalLabel: sensorSignalLabel(summary.signalState),
    bpm: formatInteger(summary.bpm),
    rrMs: formatOneDecimal(summary.rrMs),
    ibiSampleCount: String(summary.ibiSampleCount),
    samplesPerMinute: formatInteger(summary.samplesPerMinute),
    lastUpdate: formatSensorListAge(summary.lastSampleAgeMs),
    topic: summary.topic ?? "--",
  }));
}

export function buildSessionControlTabs(
  runStatus: ExperienceRunState["status"],
  timelineCount: number,
  sensorCount: number,
  commandCount: number,
): SessionControlTabItem[] {
  const tabs: SessionControlTabItem[] = [
    { id: "operate", label: "Operação" },
    { id: "timeline", label: "Timeline", count: timelineCount },
    { id: "sensors", label: "Sensores", count: sensorCount },
    { id: "history", label: "Histórico", count: commandCount },
  ];
  if (runStatus === "ended") {
    tabs.push({ id: "report", label: "Relatório" });
  }
  return tabs;
}

export function primarySensorSummary(summaries: SensorTelemetrySummary[]): SensorTelemetrySummary | null {
  return (
    summaries.find((summary) => summary.signalState === "streaming") ??
    summaries.find((summary) => summary.signalState === "poor") ??
    summaries.find((summary) => summary.signalState === "stale") ??
    summaries[0] ??
    null
  );
}

function primaryManagedSensor(sensors: ManagedSensorView[]): ManagedSensorView | null {
  return (
    [...sensors]
      .filter(
        (sensor) =>
          Boolean(sensor.attachedRunId) ||
          sensor.armedForNextRun ||
          ["recording", "connected", "stale", "connecting", "error"].includes(sensor.state),
      )
      .sort((left, right) => managedSensorPriority(left) - managedSensorPriority(right))[0] ?? null
  );
}

function managedSensorPriority(sensor: ManagedSensorView): number {
  if (sensor.state === "recording" || (sensor.attachedRunId && sensor.recordingGateOpen)) return 0;
  if (sensor.attachedRunId) return 1;
  if (sensor.armedForNextRun) return 2;
  if (sensor.state === "connected") return 3;
  if (sensor.state === "stale") return 4;
  if (sensor.state === "connecting") return 5;
  return 6;
}

function summarizeManagedSensor(sensor: ManagedSensorView): {
  label: string;
  detail: string;
  tone: RunHeaderSummary["sensorTone"];
} {
  const lsl = deriveLslSensorDetails(sensor);
  const state =
    sensor.state === "recording" || (sensor.attachedRunId && sensor.recordingGateOpen)
      ? "Gravando"
      : sensor.armedForNextRun
        ? "Armado"
        : sensorStateLabel(sensor.state);
  const detailParts: string[] = [];

  if (lsl) {
    detailParts.push("LSL");
    if (lsl.channels !== "--") detailParts.push(`${lsl.channels} ch`);
    if (lsl.rate !== "--") detailParts.push(lsl.rate);
    if (lsl.sync !== "--") detailParts.push(`sync ${lsl.sync}`);
  } else if (sensor.previewSummary && sensor.previewSummary !== "--") {
    detailParts.push(sensor.previewSummary);
  } else {
    if (sensor.source && sensor.source !== "--") detailParts.push(sensor.source);
    if (sensor.deviceType && sensor.deviceType !== "--") detailParts.push(sensor.deviceType);
  }

  return {
    label: `${lsl?.name ?? sensor.displayName}: ${state.toLowerCase()}`,
    detail: detailParts.join(" / ") || "Sensor gerenciado conectado",
    tone: sensor.armedForNextRun ? "ok" : sensorStateTone(sensor.state),
  };
}

function experienceRunLabel(status: ExperienceRunState["status"]): string {
  if (status === "not_started") return "Não iniciada";
  if (status === "running") return "Em execução";
  if (status === "paused") return "Em pausa";
  return "Encerrada";
}

function formatInteger(value: number | undefined): string {
  return typeof value === "number" ? String(Math.round(value)) : "--";
}

function formatOneDecimal(value: number | undefined): string {
  return typeof value === "number" ? String(Math.round(value * 10) / 10) : "--";
}

function formatSensorListAge(ageMs: number | undefined): string {
  if (typeof ageMs !== "number") {
    return "--";
  }
  if (ageMs < 1000) {
    return "agora";
  }
  if (ageMs < 10000) {
    return `há ${(ageMs / 1000).toFixed(1)} s`;
  }
  if (ageMs < 60000) {
    return `há ${Math.round(ageMs / 1000)} s`;
  }
  return `há ${Math.round(ageMs / 60000)} min`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("pt-BR", { hour12: false });
}
