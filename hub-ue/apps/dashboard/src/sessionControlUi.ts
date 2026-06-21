import type { ExperienceRunState } from "./experienceRun";
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
): RunHeaderSummary {
  const primary = primarySensorSummary(sensors);
  const unrealState = sessionStateLabel(sessionState.state);

  return {
    experienceLabel: experienceRunLabel(run.status),
    unrealLabel: `Unreal ${unrealState.toLowerCase()}`,
    unrealDetail: sessionState.sourceClientId
      ? `${sessionState.sourceClientId}${sessionState.receivedAt ? ` · ${formatTime(sessionState.receivedAt)}` : ""}`
      : "No unreal.state observed",
    unrealTone: sessionStateTone(sessionState.state),
    sensorLabel: primary ? `${primary.device ?? primary.clientId} ${primary.signalState}` : "No sensor stream",
    sensorDetail: primary ? `BPM ${formatInteger(primary.bpm)} · RR ${formatOneDecimal(primary.rrMs)} ms` : "No biometric sample observed",
    sensorTone: sensorSignalTone(primary?.signalState ?? "unknown"),
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
    { id: "operate", label: "Operate" },
    { id: "timeline", label: "Timeline", count: timelineCount },
    { id: "sensors", label: "Sensors", count: sensorCount },
    { id: "history", label: "History", count: commandCount },
  ];
  if (runStatus === "ended") {
    tabs.push({ id: "report", label: "Report" });
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

function experienceRunLabel(status: ExperienceRunState["status"]): string {
  if (status === "not_started") return "Not started";
  if (status === "running") return "Running";
  if (status === "paused") return "Paused";
  return "Ended";
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
    return "now";
  }
  if (ageMs < 10000) {
    return `${(ageMs / 1000).toFixed(1)}s ago`;
  }
  if (ageMs < 60000) {
    return `${Math.round(ageMs / 1000)}s ago`;
  }
  return `${Math.round(ageMs / 60000)}m ago`;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour12: false });
}
