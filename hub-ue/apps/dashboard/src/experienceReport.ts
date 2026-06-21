import type { CaptureProfile } from "./captureProfile";
import type { CommandHistoryItem } from "./commandHistory";
import { deriveExperienceAnalytics } from "./experienceAnalytics";
import type { ExperienceAnalytics } from "./experienceAnalytics";
import type { SubjectSnapshot } from "./subjectProfile";
import {
  experienceRunElapsedMs,
  experienceRunPausedMs,
} from "./experienceRun";
import type { AnalyticSessionTimelineItem, ExperienceRunState } from "./experienceRun";
import type { SensorSignalState } from "./sensorTelemetry";
import type { StreamEvent } from "./types";

export interface ExperienceReport {
  summary: {
    startedAt?: string;
    endedAt?: string;
    runId?: string;
    runSource?: ExperienceRunState["source"];
    label?: string;
    durationMs: number;
    pausedMs: number;
    markerCount: number;
    stateChangeCount: number;
    biometricObservationCount: number;
    commandCount: number;
  };
  analytics: ExperienceAnalytics;
  biometrics: SensorReportSummary[];
  markers: MarkerReportRow[];
  commands: CommandReportSummary;
}

export type ExperienceReportHealthStatus = "ready" | "no_biometrics" | "no_markers" | "sensor_gaps" | "command_issues";

export interface ExperienceReportHealth {
  primary: ExperienceReportHealthStatus;
  label: string;
  tone: "ok" | "warn" | "error" | "muted";
  flags: ExperienceReportHealthStatus[];
  details: string[];
  metrics: {
    biometricSampleCount: number;
    markerCount: number;
    commandIssueCount: number;
    sensorGapCount: number;
    poorSignalCount: number;
    bpmMin?: number;
    bpmAvg?: number;
    bpmMax?: number;
    rrAvgMs?: number;
  };
}

export interface SensorReportSummary {
  sensorClientId: string;
  sampleCount: number;
  bpmMin?: number;
  bpmAvg?: number;
  bpmMax?: number;
  rrAvgMs?: number;
  ibiSampleCount: number;
  firstSampleAt?: string;
  lastSampleAt?: string;
  poorObservationCount: number;
  gapObservationCount: number;
}

export interface MarkerReportRow {
  id: string;
  experienceTimeMs: number;
  label: string;
  note?: string;
  detail: string;
  source?: string;
  sourceClientId: string;
  commandId?: string;
  bpm?: number;
  rrMs?: number;
  sensorSignal?: SensorSignalState;
}

export interface CommandReportSummary {
  total: number;
  accepted: number;
  rejected: number;
  timeout: number;
  failed: number;
  pending: number;
}

export interface ReportTimelineExportItem {
  experienceTimeMs: number;
  experienceTime: string;
  receivedAt: string;
  kind: AnalyticSessionTimelineItem["kind"];
  title: string;
  note?: string;
  detail: string;
  source?: string;
  sourceClientId: string;
  commandId?: string;
  phase: AnalyticSessionTimelineItem["phase"];
  tone: AnalyticSessionTimelineItem["tone"];
  sensorClientId?: string;
  bpm?: number;
  rrMs?: number;
  ibiSampleCount?: number;
  sensorSignal?: SensorSignalState;
}

export interface MarkerSnapshotExportRow {
  experienceTimeMs: number;
  experienceTime: string;
  label: string;
  note?: string;
  source?: string;
  sourceClientId: string;
  commandId?: string;
  bpm?: number;
  rrMs?: number;
  sensorSignal?: SensorSignalState;
  detail: string;
}

export interface ReportExportEnvelopeV1 {
  schemaVersion: 1;
  exportedAt: string;
  // Fase 0: contexto fisiológico opcional (preenchido a partir da Fase 1).
  // Mantém schemaVersion 1 — campos opcionais são retrocompatíveis.
  subject?: SubjectSnapshot;
  capture?: CaptureProfile;
  summary: ExperienceReport["summary"];
  report: ExperienceReport;
  analytics: ExperienceAnalytics;
  timeline: ReportTimelineExportItem[];
  commandHistory: CommandHistoryItem[];
  sensors: SensorReportSummary[];
}

export interface ReportExportOptions {
  timeline?: AnalyticSessionTimelineItem[];
  commandHistory?: CommandHistoryItem[];
  subject?: SubjectSnapshot;
  capture?: CaptureProfile;
}

interface HrvReportSample {
  sensorClientId: string;
  receivedAt: string;
  bpm?: number;
  rrMs?: number;
  ibiSampleCount: number;
}

export function deriveExperienceReport(
  run: ExperienceRunState,
  timeline: AnalyticSessionTimelineItem[],
  events: StreamEvent[],
  commandHistory: CommandHistoryItem[],
): ExperienceReport {
  const reportTime = run.endedAt ?? run.pausedStartedAt ?? run.startedAt ?? new Date(0).toISOString();
  return {
    summary: {
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      runId: run.runId,
      runSource: run.source,
      label: run.label,
      durationMs: experienceRunElapsedMs(run, reportTime),
      pausedMs: experienceRunPausedMs(run, reportTime),
      markerCount: timeline.filter((item) => item.kind === "marker").length,
      stateChangeCount: timeline.filter((item) => item.kind === "state").length,
      biometricObservationCount: timeline.filter((item) => item.kind === "biometric").length,
      commandCount: commandHistory.length,
    },
    analytics: deriveExperienceAnalytics(run, events),
    biometrics: deriveSensorReportSummaries(run, timeline, events),
    markers: deriveMarkerRows(timeline),
    commands: deriveCommandSummary(commandHistory),
  };
}

export function serializeExperienceReportJson(
  report: ExperienceReport,
  exportedAt: string,
  options: ReportExportOptions = {},
): string {
  return JSON.stringify(buildReportExportEnvelope(report, exportedAt, options), null, 2);
}

export function buildReportExportEnvelope(
  report: ExperienceReport,
  exportedAt: string,
  options: ReportExportOptions = {},
): ReportExportEnvelopeV1 {
  return {
    schemaVersion: 1,
    exportedAt,
    subject: options.subject,
    capture: options.capture,
    summary: report.summary,
    report,
    analytics: report.analytics,
    timeline: (options.timeline ?? []).map(timelineExportItem),
    commandHistory: options.commandHistory ?? [],
    sensors: report.biometrics,
  };
}

export function deriveExperienceReportHealth(report: ExperienceReport): ExperienceReportHealth {
  const biometricSampleCount = report.biometrics.reduce((total, sensor) => total + sensor.sampleCount, 0);
  const sensorGapCount = report.biometrics.reduce((total, sensor) => total + sensor.gapObservationCount, 0);
  const poorSignalCount = report.biometrics.reduce((total, sensor) => total + sensor.poorObservationCount, 0);
  const issues = commandIssueCount(report.commands);
  const bpmValues = report.biometrics.flatMap((sensor) =>
    [sensor.bpmMin, sensor.bpmAvg, sensor.bpmMax].filter(isNumber),
  );
  const rrValues = report.biometrics.map((sensor) => sensor.rrAvgMs).filter(isNumber);
  const flags: ExperienceReportHealthStatus[] = [];

  if (biometricSampleCount === 0) flags.push("no_biometrics");
  if (report.summary.markerCount === 0) flags.push("no_markers");
  if (sensorGapCount > 0) flags.push("sensor_gaps");
  if (issues > 0) flags.push("command_issues");
  if (flags.length === 0) flags.push("ready");

  const primary = flags.includes("command_issues")
    ? "command_issues"
    : flags.includes("sensor_gaps")
      ? "sensor_gaps"
      : flags.includes("no_biometrics")
        ? "no_biometrics"
        : flags.includes("no_markers")
          ? "no_markers"
          : "ready";

  return {
    primary,
    label: reportHealthLabel(primary),
    tone: reportHealthTone(primary),
    flags,
    details: reportHealthDetails(flags, {
      biometricSampleCount,
      markerCount: report.summary.markerCount,
      commandIssueCount: issues,
      sensorGapCount,
      poorSignalCount,
    }),
    metrics: {
      biometricSampleCount,
      markerCount: report.summary.markerCount,
      commandIssueCount: issues,
      sensorGapCount,
      poorSignalCount,
      bpmMin: minValue(bpmValues),
      bpmAvg: averageValue(report.biometrics.map((sensor) => sensor.bpmAvg).filter(isNumber)),
      bpmMax: maxValue(bpmValues),
      rrAvgMs: averageValue(rrValues),
    },
  };
}

export function serializeExperienceReportCsv(report: ExperienceReport): string {
  const sections = [
    serializeSummarySection(report),
    serializeBiometricsSection(report),
    serializeMarkersSection(report),
    serializeCommandsSection(report),
  ];
  return sections.join("\n\n");
}

export function serializeBiometricsSummaryCsv(report: ExperienceReport): string {
  return serializeBiometricsSection(report).split("\n").slice(1).join("\n");
}

export function serializeMarkerSnapshotsCsv(report: ExperienceReport): string {
  return serializeMarkersSection(report).split("\n").slice(1).join("\n");
}

export function commandIssueCount(commands: CommandReportSummary): number {
  return commands.rejected + commands.timeout + commands.failed + commands.pending;
}

function deriveSensorReportSummaries(
  run: ExperienceRunState,
  timeline: AnalyticSessionTimelineItem[],
  events: StreamEvent[],
): SensorReportSummary[] {
  const samplesBySensor = new Map<string, HrvReportSample[]>();
  for (const event of events) {
    if (event.envelope.topic !== "hrv.raw" || !isWithinRunWindow(event.receivedAt, run)) {
      continue;
    }
    const sample = hrvSampleFromEvent(event);
    samplesBySensor.set(sample.sensorClientId, [...(samplesBySensor.get(sample.sensorClientId) ?? []), sample]);
  }

  return Array.from(samplesBySensor.entries())
    .map(([sensorClientId, samples]) => {
      const sorted = [...samples].sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
      const bpmValues = sorted.map((sample) => sample.bpm).filter(isPositiveNumber);
      const rrValues = sorted.map((sample) => sample.rrMs).filter(isNumber);
      const observations = timeline.filter((item) => item.kind === "biometric" && item.sourceClientId === sensorClientId);
      return {
        sensorClientId,
        sampleCount: sorted.length,
        bpmMin: minValue(bpmValues),
        bpmAvg: averageValue(bpmValues),
        bpmMax: maxValue(bpmValues),
        rrAvgMs: averageValue(rrValues),
        ibiSampleCount: sorted.reduce((total, sample) => total + sample.ibiSampleCount, 0),
        firstSampleAt: sorted[0]?.receivedAt,
        lastSampleAt: sorted[sorted.length - 1]?.receivedAt,
        poorObservationCount: observations.filter((item) => item.title.toLowerCase().includes("poor")).length,
        gapObservationCount: observations.filter((item) => item.title.toLowerCase().includes("gap")).length,
      };
    })
    .sort((left, right) => left.sensorClientId.localeCompare(right.sensorClientId));
}

function deriveMarkerRows(timeline: AnalyticSessionTimelineItem[]): MarkerReportRow[] {
  return timeline
    .filter((item) => item.kind === "marker")
    .sort((left, right) => left.experienceTimeMs - right.experienceTimeMs)
    .map((item) => ({
      id: item.id,
      experienceTimeMs: item.experienceTimeMs,
      label: item.title,
      note: item.note,
      detail: item.detail,
      source: item.source,
      sourceClientId: item.sourceClientId,
      commandId: item.commandId,
      bpm: item.biometricSnapshot?.bpm,
      rrMs: item.biometricSnapshot?.rrMs,
      sensorSignal: item.biometricSnapshot?.signalState,
    }));
}

function deriveCommandSummary(commandHistory: CommandHistoryItem[]): CommandReportSummary {
  return {
    total: commandHistory.length,
    accepted: commandHistory.filter((item) => item.status === "accepted").length,
    rejected: commandHistory.filter((item) => item.status === "rejected").length,
    timeout: commandHistory.filter((item) => item.status === "timeout").length,
    failed: commandHistory.filter((item) => item.status === "failed").length,
    pending: commandHistory.filter((item) => item.status === "pending").length,
  };
}

function serializeSummarySection(report: ExperienceReport): string {
  const rows: Array<[string, string | number | undefined]> = [
    ["startedAt", report.summary.startedAt],
    ["endedAt", report.summary.endedAt],
    ["runId", report.summary.runId],
    ["runSource", report.summary.runSource],
    ["label", report.summary.label],
    ["durationMs", report.summary.durationMs],
    ["pausedMs", report.summary.pausedMs],
    ["markerCount", report.summary.markerCount],
    ["stateChangeCount", report.summary.stateChangeCount],
    ["biometricObservationCount", report.summary.biometricObservationCount],
    ["commandCount", report.summary.commandCount],
  ];
  return ["Session Summary", "metric,value", ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

function serializeBiometricsSection(report: ExperienceReport): string {
  const header = [
    "sensorClientId",
    "sampleCount",
    "bpmMin",
    "bpmAvg",
    "bpmMax",
    "rrAvgMs",
    "ibiSampleCount",
    "firstSampleAt",
    "lastSampleAt",
    "poorObservationCount",
    "gapObservationCount",
  ];
  const rows = report.biometrics.map((sensor) =>
    [
      sensor.sensorClientId,
      sensor.sampleCount,
      sensor.bpmMin,
      sensor.bpmAvg,
      sensor.bpmMax,
      sensor.rrAvgMs,
      sensor.ibiSampleCount,
      sensor.firstSampleAt,
      sensor.lastSampleAt,
      sensor.poorObservationCount,
      sensor.gapObservationCount,
    ].map(csvCell).join(","),
  );
  return ["Biometrics Summary", header.join(","), ...rows].join("\n");
}

function serializeMarkersSection(report: ExperienceReport): string {
  const header = [
    "experienceTimeMs",
    "experienceTime",
    "label",
    "note",
    "source",
    "sourceClientId",
    "commandId",
    "bpm",
    "rrMs",
    "sensorSignal",
    "detail",
  ];
  const rows = report.markers.map((marker) =>
    [
      marker.experienceTimeMs,
      formatExperienceTime(marker.experienceTimeMs),
      marker.label,
      marker.note,
      marker.source,
      marker.sourceClientId,
      marker.commandId,
      marker.bpm,
      marker.rrMs,
      marker.sensorSignal,
      marker.detail,
    ].map(csvCell).join(","),
  );
  return ["Marker Snapshots", header.join(","), ...rows].join("\n");
}

function timelineExportItem(item: AnalyticSessionTimelineItem): ReportTimelineExportItem {
  return {
    experienceTimeMs: item.experienceTimeMs,
    experienceTime: formatExperienceTime(item.experienceTimeMs),
    receivedAt: item.realReceivedAt,
    kind: item.kind,
    title: item.title,
    note: item.note,
    detail: item.detail,
    source: item.source,
    sourceClientId: item.sourceClientId,
    commandId: item.commandId,
    phase: item.phase,
    tone: item.tone,
    sensorClientId: item.biometricSnapshot?.sensorClientId,
    bpm: item.biometricSnapshot?.bpm,
    rrMs: item.biometricSnapshot?.rrMs,
    ibiSampleCount: item.biometricSnapshot?.ibiSampleCount,
    sensorSignal: item.biometricSnapshot?.signalState,
  };
}

function reportHealthLabel(status: ExperienceReportHealthStatus): string {
  if (status === "ready") return "Ready";
  if (status === "no_biometrics") return "No biometrics";
  if (status === "no_markers") return "No markers";
  if (status === "sensor_gaps") return "Sensor gaps";
  return "Command issues";
}

function reportHealthTone(status: ExperienceReportHealthStatus): ExperienceReportHealth["tone"] {
  if (status === "ready") return "ok";
  if (status === "command_issues") return "error";
  if (status === "sensor_gaps" || status === "no_biometrics") return "warn";
  return "muted";
}

function reportHealthDetails(
  flags: ExperienceReportHealthStatus[],
  metrics: Pick<ExperienceReportHealth["metrics"], "biometricSampleCount" | "markerCount" | "commandIssueCount" | "sensorGapCount" | "poorSignalCount">,
): string[] {
  if (flags.includes("ready")) {
    return ["Biometrics, markers, and command outcomes are available for review."];
  }
  const details: string[] = [];
  if (flags.includes("no_biometrics")) details.push("No biometric samples captured in this browser session.");
  if (flags.includes("no_markers")) details.push("No experience markers captured.");
  if (flags.includes("sensor_gaps")) details.push(`${metrics.sensorGapCount} sensor gap${metrics.sensorGapCount === 1 ? "" : "s"} observed.`);
  if (metrics.poorSignalCount > 0) details.push(`${metrics.poorSignalCount} poor signal observation${metrics.poorSignalCount === 1 ? "" : "s"}.`);
  if (flags.includes("command_issues")) details.push(`${metrics.commandIssueCount} command issue${metrics.commandIssueCount === 1 ? "" : "s"} need review.`);
  return details;
}

function serializeCommandsSection(report: ExperienceReport): string {
  const rows: Array<[string, number]> = [
    ["accepted", report.commands.accepted],
    ["rejected", report.commands.rejected],
    ["timeout", report.commands.timeout],
    ["failed", report.commands.failed],
    ["pending", report.commands.pending],
    ["total", report.commands.total],
  ];
  return ["Command Outcomes", "status,count", ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

function hrvSampleFromEvent(event: StreamEvent): HrvReportSample {
  const payload = event.envelope.payload ?? {};
  const ibiMs = Array.isArray(payload.ibiMs) ? payload.ibiMs : [];
  const ibiSampleCount = readNumber(payload.ibiSampleCount) ?? ibiMs.length;
  return {
    sensorClientId: event.envelope.clientId,
    receivedAt: event.receivedAt,
    bpm: readNumber(payload.bpm),
    rrMs: readNumber(payload.rrMs),
    ibiSampleCount,
  };
}

function isWithinRunWindow(receivedAt: string, run: ExperienceRunState): boolean {
  if (!run.startedAt || Date.parse(receivedAt) < Date.parse(run.startedAt)) {
    return false;
  }
  return !run.endedAt || Date.parse(receivedAt) <= Date.parse(run.endedAt);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number";
}

function isPositiveNumber(value: number | undefined): value is number {
  return typeof value === "number" && value > 0;
}

function minValue(values: number[]): number | undefined {
  return values.length > 0 ? Math.min(...values.map(Math.round)) : undefined;
}

function maxValue(values: number[]): number | undefined {
  return values.length > 0 ? Math.max(...values.map(Math.round)) : undefined;
}

function averageValue(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;
}

function formatExperienceTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  const text = String(value);
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}
