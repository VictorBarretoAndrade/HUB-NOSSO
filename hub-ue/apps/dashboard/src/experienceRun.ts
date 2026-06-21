import { deriveSessionTimeline } from "./markers";
import type { SessionTimelineItem } from "./markers";
import type { ExperienceReport } from "./experienceReport";
import type { StreamEvent } from "./types";

export type ExperienceRunStatus = "not_started" | "running" | "paused" | "ended";
export type ExperiencePhase = "running" | "paused";
export type ExperienceRunSource = "dashboard" | "xr";

export interface ExperienceRunState {
  status: ExperienceRunStatus;
  startedAt?: string;
  endedAt?: string;
  pausedStartedAt?: string;
  totalPausedMs: number;
  runId?: string;
  source?: ExperienceRunSource;
  label?: string;
}

export interface AnalyticSessionTimelineItem extends SessionTimelineItem {
  realReceivedAt: string;
  experienceTimeMs: number;
  phase: ExperiencePhase;
}

export interface ExperienceRunSummary {
  status: ExperienceRunStatus;
  startedAt?: string;
  endedAt?: string;
  runId?: string;
  source?: ExperienceRunSource;
  label?: string;
  experienceTimeMs: number;
  pausedTimeMs: number;
  markerCount: number;
  stateChangeCount: number;
  itemCount: number;
}

interface PauseInterval {
  startMs: number;
  endMs?: number;
}

const CSV_COLUMNS = [
  "experienceStartedAt",
  "experienceEndedAt",
  "experienceTimeMs",
  "experienceTime",
  "receivedAt",
  "kind",
  "title",
  "detail",
  "source",
  "sourceClientId",
  "commandId",
  "phase",
  "tone",
  "sensorClientId",
  "bpm",
  "rrMs",
  "ibiSampleCount",
  "sensorSignal",
] as const;

export function resetExperienceRun(): ExperienceRunState {
  return { status: "not_started", totalPausedMs: 0 };
}

export function startExperienceRun(
  now: string,
  options: { runId?: string; source?: ExperienceRunSource; label?: string } = {},
): ExperienceRunState {
  const run: ExperienceRunState = {
    status: "running",
    startedAt: now,
    totalPausedMs: 0,
    source: options.source ?? "dashboard",
  };
  if (options.runId) run.runId = options.runId;
  if (options.source) run.source = options.source;
  if (options.label) run.label = options.label;
  return run;
}

export function startNextExperienceRun(_previous: ExperienceRunState, now: string): ExperienceRunState {
  return startExperienceRun(now);
}

export function pauseExperienceRun(run: ExperienceRunState, observedAt: string): ExperienceRunState {
  if (run.status !== "running" || !run.startedAt) {
    return run;
  }
  return {
    ...run,
    status: "paused",
    pausedStartedAt: observedAt,
  };
}

export function resumeExperienceRun(run: ExperienceRunState, observedAt: string): ExperienceRunState {
  if (run.status !== "paused" || !run.pausedStartedAt) {
    return run;
  }
  return {
    ...run,
    status: "running",
    pausedStartedAt: undefined,
    totalPausedMs: run.totalPausedMs + durationBetween(run.pausedStartedAt, observedAt),
  };
}

export function endExperienceRun(run: ExperienceRunState, endedAt: string): ExperienceRunState {
  if (!run.startedAt || run.status === "not_started") {
    return run;
  }
  const extraPausedMs =
    run.status === "paused" && run.pausedStartedAt ? durationBetween(run.pausedStartedAt, endedAt) : 0;
  return {
    ...run,
    status: "ended",
    endedAt,
    pausedStartedAt: undefined,
    totalPausedMs: run.totalPausedMs + extraPausedMs,
  };
}

export function experienceRunElapsedMs(run: ExperienceRunState, now: string): number {
  if (!run.startedAt) {
    return 0;
  }
  const endAt = run.endedAt ?? (run.status === "paused" && run.pausedStartedAt ? run.pausedStartedAt : now);
  return Math.max(0, durationBetween(run.startedAt, endAt) - run.totalPausedMs);
}

export function experienceRunPausedMs(run: ExperienceRunState, now: string): number {
  const activePausedMs =
    run.status === "paused" && run.pausedStartedAt ? durationBetween(run.pausedStartedAt, now) : 0;
  return Math.max(0, run.totalPausedMs + activePausedMs);
}

export function deriveAnalyticSessionTimeline(
  events: StreamEvent[],
  run: ExperienceRunState,
  limit = 200,
): AnalyticSessionTimelineItem[] {
  if (!run.startedAt) {
    return [];
  }
  const windowEvents = events.filter((event) => isWithinRunWindow(event.receivedAt, run));
  const pauseIntervals = derivePauseIntervals(windowEvents);
  return deriveSessionTimeline(windowEvents, limit).map((item) => ({
    ...item,
    realReceivedAt: item.receivedAt,
    experienceTimeMs: experienceTimeAt(item.receivedAt, run.startedAt!, pauseIntervals),
    phase: phaseAt(item.receivedAt, pauseIntervals),
  }));
}

export function summarizeExperienceRun(
  run: ExperienceRunState,
  items: AnalyticSessionTimelineItem[],
  now: string,
): ExperienceRunSummary {
  return {
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    runId: run.runId,
    source: run.source,
    label: run.label,
    experienceTimeMs: experienceRunElapsedMs(run, now),
    pausedTimeMs: experienceRunPausedMs(run, now),
    markerCount: items.filter((item) => item.kind === "marker").length,
    stateChangeCount: items.filter((item) => item.kind === "state").length,
    itemCount: items.length,
  };
}

export function serializeExperienceRunJson(
  run: ExperienceRunState,
  items: AnalyticSessionTimelineItem[],
  exportedAt: string,
  report?: ExperienceReport,
): string {
  return JSON.stringify(
    {
      exportedAt,
      summary: summarizeExperienceRun(run, items, exportedAt),
      run: {
        runId: run.runId,
        source: run.source,
        label: run.label,
      },
      report,
      items: items.map(toExportItem),
    },
    null,
    2,
  );
}

export function serializeExperienceRunCsv(
  run: ExperienceRunState,
  items: AnalyticSessionTimelineItem[],
  exportedAt: string,
): string {
  const summary = summarizeExperienceRun(run, items, exportedAt);
  const rows = items.map((item) => {
    const exportItem = toExportItem(item);
    const row = {
      experienceStartedAt: summary.startedAt,
      experienceEndedAt: summary.endedAt,
      ...exportItem,
    };
    return CSV_COLUMNS.map((column) => csvCell(row[column])).join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

export function formatExperienceTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function toExportItem(item: AnalyticSessionTimelineItem) {
  return {
    experienceTimeMs: item.experienceTimeMs,
    experienceTime: formatExperienceTime(item.experienceTimeMs),
    receivedAt: item.realReceivedAt,
    kind: item.kind,
    title: item.title,
    detail: item.detail,
    source: item.source,
    sourceClientId: item.sourceClientId,
    commandId: item.commandId,
    phase: item.phase,
    tone: item.tone,
    biometricSnapshot: item.biometricSnapshot,
    sensorClientId: item.biometricSnapshot?.sensorClientId,
    bpm: item.biometricSnapshot?.bpm,
    rrMs: item.biometricSnapshot?.rrMs,
    ibiSampleCount: item.biometricSnapshot?.ibiSampleCount,
    sensorSignal: item.biometricSnapshot?.signalState,
  };
}

function isWithinRunWindow(receivedAt: string, run: ExperienceRunState): boolean {
  if (!run.startedAt || Date.parse(receivedAt) < Date.parse(run.startedAt)) {
    return false;
  }
  return !run.endedAt || Date.parse(receivedAt) <= Date.parse(run.endedAt);
}

function derivePauseIntervals(events: StreamEvent[]): PauseInterval[] {
  const intervals: PauseInterval[] = [];
  let pausedStartMs: number | null = null;
  const sorted = [...events].sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));

  for (const event of sorted) {
    if (event.envelope.topic !== "unreal.state") {
      continue;
    }
    const phase = phaseFromPayload(event.envelope.payload ?? {});
    if (phase === "paused" && pausedStartMs === null) {
      pausedStartMs = Date.parse(event.receivedAt);
    }
    if (phase === "running" && pausedStartMs !== null) {
      intervals.push({ startMs: pausedStartMs, endMs: Date.parse(event.receivedAt) });
      pausedStartMs = null;
    }
  }

  if (pausedStartMs !== null) {
    intervals.push({ startMs: pausedStartMs });
  }
  return intervals;
}

function phaseAt(receivedAt: string, intervals: PauseInterval[]): ExperiencePhase {
  const timeMs = Date.parse(receivedAt);
  return intervals.some((interval) => timeMs >= interval.startMs && (interval.endMs === undefined || timeMs < interval.endMs))
    ? "paused"
    : "running";
}

function experienceTimeAt(receivedAt: string, startedAt: string, intervals: PauseInterval[]): number {
  const receivedMs = Date.parse(receivedAt);
  const startedMs = Date.parse(startedAt);
  const pausedBeforeMs = intervals.reduce((total, interval) => {
    if (receivedMs <= interval.startMs) {
      return total;
    }
    const intervalEnd = interval.endMs === undefined ? receivedMs : Math.min(interval.endMs, receivedMs);
    return total + Math.max(0, intervalEnd - interval.startMs);
  }, 0);
  return Math.max(0, receivedMs - startedMs - pausedBeforeMs);
}

function phaseFromPayload(payload: Record<string, unknown>): ExperiencePhase | null {
  const state = readString(payload.state)?.toLowerCase();
  const status = readString(payload.status)?.toLowerCase();
  if (state === "paused" || status === "idle") {
    return "paused";
  }
  if (state === "running" || status === "online" || status === "busy") {
    return "running";
  }
  return null;
}

function durationBetween(start: string, end: string): number {
  return Math.max(0, Date.parse(end) - Date.parse(start));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
