import { endExperienceRun, startExperienceRun } from "./experienceRun";
import type { ExperienceRunState } from "./experienceRun";
import type { StreamEvent } from "./types";

export const EXPERIENCE_LIFECYCLE_TOPIC = "experience.lifecycle";

export type ExperienceLifecycleEventType = "started" | "ended";

export interface ExperienceLifecycleSummary {
  event: ExperienceLifecycleEventType;
  runId: string;
  label?: string;
  source?: string;
  reason?: string;
  sourceClientId: string;
  receivedAt: string;
}

export interface ExperienceLifecycleApplication {
  run: ExperienceRunState;
  applied: boolean;
  startedNewRun: boolean;
  conflict?: string;
}

export function deriveExperienceLifecycleEvents(events: StreamEvent[]): ExperienceLifecycleSummary[] {
  const summaries = events
    .filter((event) => event.envelope.topic === EXPERIENCE_LIFECYCLE_TOPIC)
    .map(lifecycleSummaryFromEvent)
    .filter((summary): summary is ExperienceLifecycleSummary => summary !== null)
    .sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));

  const seen = new Set<string>();
  return summaries.filter((summary) => {
    const key = `${summary.runId}:${summary.event}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function lifecycleSummaryFromEvent(event: StreamEvent): ExperienceLifecycleSummary | null {
  if (event.envelope.topic !== EXPERIENCE_LIFECYCLE_TOPIC) {
    return null;
  }
  const payload = event.envelope.payload ?? {};
  const lifecycleEvent = readLifecycleEvent(payload.event);
  const runId = readString(payload.runId);
  if (!lifecycleEvent || !runId) {
    return null;
  }
  return {
    event: lifecycleEvent,
    runId,
    label: readString(payload.label),
    source: readString(payload.source),
    reason: readString(payload.reason),
    sourceClientId: event.envelope.clientId,
    receivedAt: event.receivedAt,
  };
}

export function applyExperienceLifecycleEvent(
  run: ExperienceRunState,
  lifecycle: ExperienceLifecycleSummary,
): ExperienceLifecycleApplication {
  if (lifecycle.event === "started") {
    if (run.status === "not_started" || run.status === "ended") {
      return {
        run: startExperienceRun(lifecycle.receivedAt, {
          label: lifecycle.label,
          runId: lifecycle.runId,
          source: "xr",
        }),
        applied: true,
        startedNewRun: true,
      };
    }

    if (run.runId === lifecycle.runId) {
      return { run, applied: false, startedNewRun: false };
    }

    return {
      run,
      applied: false,
      startedNewRun: false,
      conflict: `Lifecycle started for ${lifecycle.runId} ignored; ${run.source === "dashboard" ? "dashboard" : "another"} run is active.`,
    };
  }

  if (run.status === "not_started") {
    return { run, applied: false, startedNewRun: false };
  }
  if (run.source === "dashboard" && !run.runId) {
    return {
      run,
      applied: false,
      startedNewRun: false,
      conflict: `Lifecycle ended for ${lifecycle.runId} ignored; dashboard run is active.`,
    };
  }
  if (run.runId && run.runId !== lifecycle.runId) {
    return {
      run,
      applied: false,
      startedNewRun: false,
      conflict: `Lifecycle ended for ${lifecycle.runId} ignored; active run is ${run.runId}.`,
    };
  }
  if (run.status === "ended") {
    return { run, applied: false, startedNewRun: false };
  }

  return {
    run: endExperienceRun(run.runId ? run : { ...run, runId: lifecycle.runId, source: "xr" }, lifecycle.receivedAt),
    applied: true,
    startedNewRun: false,
  };
}

function readLifecycleEvent(value: unknown): ExperienceLifecycleEventType | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "started" || normalized === "ended") {
    return normalized;
  }
  return null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
