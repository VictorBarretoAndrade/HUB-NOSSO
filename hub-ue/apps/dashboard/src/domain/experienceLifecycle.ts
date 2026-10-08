import { endExperienceRun, startExperienceRun } from "./experienceRun";
import type { ExperienceRunState } from "./experienceRun";
import type { MessageEnvelope, StatusResponse, StreamEvent } from "./types";

export const EXPERIENCE_LIFECYCLE_TOPIC = "experience.lifecycle";

export type ExperienceLifecycleEventType = "started" | "ended";

export type LifecycleTransitionPhase = "awaiting" | "uncertain" | "conflict";
export type LifecycleTransitionPurpose = "normal" | "recovery";

export interface PendingLifecycleTransition {
  event: ExperienceLifecycleEventType;
  runId: string;
  messageId: string;
  label?: string;
  purpose: LifecycleTransitionPurpose;
  phase: LifecycleTransitionPhase;
}

export interface LifecycleErrorSummary {
  code: "lifecycle_conflict" | "lifecycle_already_ended";
  message: string;
  activeRunId?: string;
  requestedRunId?: string;
  requestedEvent?: ExperienceLifecycleEventType;
}

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

export function createPendingLifecycleTransition(
  event: ExperienceLifecycleEventType,
  runId: string,
  options: {
    messageId: string;
    label?: string;
    purpose?: LifecycleTransitionPurpose;
  },
): PendingLifecycleTransition {
  return {
    event,
    runId,
    messageId: options.messageId,
    label: options.label,
    purpose: options.purpose ?? "normal",
    phase: "awaiting",
  };
}

export function markLifecycleTransitionUncertain(
  pending: PendingLifecycleTransition,
): PendingLifecycleTransition {
  if (pending.phase === "conflict") {
    return pending;
  }
  return { ...pending, phase: "uncertain" };
}

export function markLifecycleTransitionConflict(
  pending: PendingLifecycleTransition,
): PendingLifecycleTransition {
  return { ...pending, phase: "conflict" };
}

export function lifecycleTransitionConflict(
  pending: PendingLifecycleTransition,
  activeRunId: string | null | undefined,
): string | null {
  if (!activeRunId || activeRunId === pending.runId) {
    return null;
  }
  return `O hub reporta a run ${activeRunId} como ativa; o lifecycle "${pending.event}" da run ${pending.runId} continua sem resolução.`;
}

export function activeExperienceRunId(status: StatusResponse | null | undefined): string | null {
  const authoritative = status?.experienceLifecycle?.activeRunId;
  if (typeof authoritative === "string" && authoritative.trim()) {
    return authoritative.trim();
  }
  if (authoritative === null) {
    return null;
  }

  const sensorManagerRunId = status?.sensorManager?.activeRunId;
  return typeof sensorManagerRunId === "string" && sensorManagerRunId.trim()
    ? sensorManagerRunId.trim()
    : null;
}

export function unmatchedActiveRunId(
  run: ExperienceRunState,
  activeRunId: string | null | undefined,
): string | null {
  if (!activeRunId) {
    return null;
  }
  const localRunIsActive = run.status === "running" || run.status === "paused";
  return localRunIsActive && run.runId === activeRunId ? null : activeRunId;
}

export function isLifecycleRecoveryCurrent(
  requestedRunId: string | null | undefined,
  activeRunId: string | null | undefined,
): boolean {
  return Boolean(requestedRunId && activeRunId && requestedRunId === activeRunId);
}

export function canReconcileCompletedRecovery(
  pending: PendingLifecycleTransition | null | undefined,
  status: StatusResponse | null | undefined,
): boolean {
  if (
    !pending
    || pending.event !== "ended"
    || pending.purpose !== "recovery"
    || pending.phase === "conflict"
    || !status?.sensorManager
  ) {
    return false;
  }
  if (activeExperienceRunId(status) !== null) {
    return false;
  }
  return status.sensorManager.sensors.every((sensor) => !sensor.attachedRunId);
}

export function lifecycleErrorForPending(
  envelope: MessageEnvelope,
  pending: PendingLifecycleTransition | null | undefined,
): LifecycleErrorSummary | null {
  if (
    !pending
    || envelope.type !== "error"
    || envelope.correlationId !== pending.messageId
  ) {
    return null;
  }

  const payload = envelope.payload ?? {};
  const code = readString(payload.code);
  if (code !== "lifecycle_conflict" && code !== "lifecycle_already_ended") {
    return null;
  }

  const detail = readRecord(payload.detail);
  return {
    code,
    message: readString(payload.message) ?? "O pedido de lifecycle foi rejeitado.",
    activeRunId: readString(detail?.activeRunId),
    requestedRunId: readString(detail?.requestedRunId),
    requestedEvent: readLifecycleEvent(detail?.requestedEvent) ?? undefined,
  };
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
          source: lifecycle.source === "dashboard" ? "dashboard" : "xr",
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
      conflict: `Lifecycle "started" da run ${lifecycle.runId} ignorado: ${run.source === "dashboard" ? "a run do dashboard" : "outra run"} está ativa.`,
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
      conflict: `Lifecycle "ended" da run ${lifecycle.runId} ignorado: a run do dashboard está ativa.`,
    };
  }
  if (run.runId && run.runId !== lifecycle.runId) {
    return {
      run,
      applied: false,
      startedNewRun: false,
      conflict: `Lifecycle "ended" da run ${lifecycle.runId} ignorado: a run ativa é ${run.runId}.`,
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

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
