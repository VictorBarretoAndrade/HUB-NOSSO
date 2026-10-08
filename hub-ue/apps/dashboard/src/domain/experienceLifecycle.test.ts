import { describe, expect, it } from "vitest";
import {
  activeExperienceRunId,
  applyExperienceLifecycleEvent,
  canReconcileCompletedRecovery,
  createPendingLifecycleTransition,
  deriveExperienceLifecycleEvents,
  isLifecycleRecoveryCurrent,
  lifecycleErrorForPending,
  lifecycleTransitionConflict,
  markLifecycleTransitionConflict,
  markLifecycleTransitionUncertain,
  unmatchedActiveRunId,
} from "./experienceLifecycle";
import { endExperienceRun, resetExperienceRun, startExperienceRun } from "./experienceRun";
import type { MessageEnvelope, StatusResponse, StreamEvent } from "./types";

function event(
  receivedAt: string,
  payload: Record<string, unknown>,
  clientId = "unreal-quest-host",
): StreamEvent {
  return {
    receivedAt,
    envelope: {
      type: "publish",
      clientId,
      topic: "experience.lifecycle",
      sessionTimeMs: 1000,
      payload,
    },
  };
}

describe("experience lifecycle", () => {
  it("keeps the same run id when an unconfirmed lifecycle transition is retried", () => {
    const pending = createPendingLifecycleTransition("started", "run-stable", {
      messageId: "message-start",
      label: "Dashboard Experience",
    });
    const uncertain = markLifecycleTransitionUncertain(pending);
    const retry = createPendingLifecycleTransition(uncertain.event, uncertain.runId, {
      messageId: "message-retry",
      label: uncertain.label,
      purpose: uncertain.purpose,
    });

    expect(uncertain).toMatchObject({ phase: "uncertain", runId: "run-stable" });
    expect(retry).toEqual({
      event: "started",
      runId: "run-stable",
      messageId: "message-retry",
      label: "Dashboard Experience",
      purpose: "normal",
      phase: "awaiting",
    });
  });

  it("detects an authoritative run conflict without releasing the pending transition", () => {
    const pending = markLifecycleTransitionConflict(
      createPendingLifecycleTransition("started", "run-dashboard", { messageId: "message-start" }),
    );

    expect(pending.phase).toBe("conflict");
    expect(lifecycleTransitionConflict(pending, "run-dashboard")).toBeNull();
    expect(lifecycleTransitionConflict(pending, null)).toBeNull();
    expect(lifecycleTransitionConflict(pending, "run-unreal")).toContain("run-unreal");
    expect(markLifecycleTransitionUncertain(pending).phase).toBe("conflict");
  });

  it("prefers the Runtime lifecycle state and falls back for older Hubs", () => {
    const authoritative = {
      experienceLifecycle: { activeRunId: "run-runtime" },
      sensorManager: { activeRunId: "run-sensor" },
    } as StatusResponse;
    const legacy = {
      sensorManager: { activeRunId: "run-sensor" },
    } as StatusResponse;

    expect(activeExperienceRunId(authoritative)).toBe("run-runtime");
    expect(activeExperienceRunId(legacy)).toBe("run-sensor");
    expect(activeExperienceRunId({ experienceLifecycle: { activeRunId: null } } as StatusResponse)).toBeNull();
  });

  it("detects an active Hub run that is not represented by the local dashboard", () => {
    const active = startExperienceRun("2026-04-26T12:00:00.000Z", {
      runId: "run-active",
      source: "xr",
    });
    const ended = endExperienceRun(active, "2026-04-26T12:00:05.000Z");

    expect(unmatchedActiveRunId(active, "run-active")).toBeNull();
    expect(unmatchedActiveRunId(ended, "run-active")).toBe("run-active");
    expect(unmatchedActiveRunId(resetExperienceRun(), "run-active")).toBe("run-active");
  });

  it("rejects recovery when the authoritative run changes during confirmation", () => {
    expect(isLifecycleRecoveryCurrent("run-a", "run-a")).toBe(true);
    expect(isLifecycleRecoveryCurrent("run-a", "run-b")).toBe(false);
    expect(isLifecycleRecoveryCurrent("run-a", null)).toBe(false);
  });

  it("reconciles a recovery whose echo was lost only after runtime and sensors are clear", () => {
    const recovery = markLifecycleTransitionUncertain(
      createPendingLifecycleTransition("ended", "run-a", {
        messageId: "message-end",
        purpose: "recovery",
      }),
    );
    const clearStatus = {
      experienceLifecycle: { activeRunId: null },
      sensorManager: { sensors: [] },
    } as unknown as StatusResponse;
    const attachedStatus = {
      experienceLifecycle: { activeRunId: null },
      sensorManager: {
        sensors: [{ sensorId: "sim-hrv-1", attachedRunId: "run-a" }],
      },
    } as unknown as StatusResponse;
    const changedStatus = {
      experienceLifecycle: { activeRunId: "run-b" },
      sensorManager: { sensors: [] },
    } as unknown as StatusResponse;

    expect(canReconcileCompletedRecovery(recovery, clearStatus)).toBe(true);
    expect(canReconcileCompletedRecovery(recovery, attachedStatus)).toBe(false);
    expect(canReconcileCompletedRecovery(recovery, changedStatus)).toBe(false);
    expect(
      canReconcileCompletedRecovery(
        { ...recovery, purpose: "normal" },
        clearStatus,
      ),
    ).toBe(false);
    expect(canReconcileCompletedRecovery(recovery, null)).toBe(false);
  });

  it("correlates lifecycle errors with only the matching pending message", () => {
    const pending = createPendingLifecycleTransition("started", "run-requested", {
      messageId: "message-start",
    });
    const envelope: MessageEnvelope = {
      type: "error",
      clientId: "hub",
      correlationId: "message-start",
      payload: {
        code: "lifecycle_conflict",
        message: "Another experience run is active.",
        detail: {
          activeRunId: "run-active",
          requestedRunId: "run-requested",
          requestedEvent: "started",
        },
      },
    };

    expect(lifecycleErrorForPending(envelope, pending)).toEqual({
      code: "lifecycle_conflict",
      message: "Another experience run is active.",
      activeRunId: "run-active",
      requestedRunId: "run-requested",
      requestedEvent: "started",
    });
    expect(lifecycleErrorForPending({ ...envelope, correlationId: "other" }, pending)).toBeNull();
  });

  it("recognizes an already-ended rejection for a correlated retry", () => {
    const pending = createPendingLifecycleTransition("started", "run-ended", {
      messageId: "message-retry",
    });
    const envelope: MessageEnvelope = {
      type: "error",
      clientId: "hub",
      correlationId: "message-retry",
      payload: {
        code: "lifecycle_already_ended",
        message: "An ended experience run cannot be started again.",
        detail: {
          activeRunId: null,
          requestedRunId: "run-ended",
          requestedEvent: "started",
        },
      },
    };

    expect(lifecycleErrorForPending(envelope, pending)).toEqual({
      code: "lifecycle_already_ended",
      message: "An ended experience run cannot be started again.",
      activeRunId: undefined,
      requestedRunId: "run-ended",
      requestedEvent: "started",
    });
  });

  it("derives deduplicated lifecycle summaries from experience.lifecycle events", () => {
    const summaries = deriveExperienceLifecycleEvents([
      event("2026-04-26T12:00:01.000Z", {
        event: "started",
        runId: "run-1",
        label: "block A",
        source: "xr",
      }),
      event("2026-04-26T12:00:01.100Z", {
        event: "started",
        runId: "run-1",
        label: "duplicate",
        source: "xr",
      }),
      event("2026-04-26T12:00:10.000Z", {
        event: "ended",
        runId: "run-1",
        reason: "completed",
      }),
      event("2026-04-26T12:00:11.000Z", { event: "ignored" }),
    ]);

    expect(summaries).toEqual([
      {
        event: "started",
        runId: "run-1",
        label: "block A",
        source: "xr",
        reason: undefined,
        sourceClientId: "unreal-quest-host",
        receivedAt: "2026-04-26T12:00:01.000Z",
      },
      {
        event: "ended",
        runId: "run-1",
        label: undefined,
        source: undefined,
        reason: "completed",
        sourceClientId: "unreal-quest-host",
        receivedAt: "2026-04-26T12:00:10.000Z",
      },
    ]);
  });

  it("starts an XR run from a started lifecycle event", () => {
    const lifecycle = deriveExperienceLifecycleEvents([
      event("2026-04-26T12:00:01.000Z", {
        event: "started",
        runId: "run-1",
        label: "block A",
        source: "xr",
      }),
    ])[0];

    const result = applyExperienceLifecycleEvent(resetExperienceRun(), lifecycle);

    expect(result).toMatchObject({
      applied: true,
      startedNewRun: true,
      run: {
        status: "running",
        startedAt: "2026-04-26T12:00:01.000Z",
        runId: "run-1",
        source: "xr",
        label: "block A",
      },
    });
  });

  it("ends only the matching lifecycle run", () => {
    const run = startExperienceRun("2026-04-26T12:00:01.000Z", {
      runId: "run-1",
      source: "xr",
    });
    const wrongEnd = deriveExperienceLifecycleEvents([
      event("2026-04-26T12:00:09.000Z", { event: "ended", runId: "other-run" }),
    ])[0];
    const matchingEnd = deriveExperienceLifecycleEvents([
      event("2026-04-26T12:00:10.000Z", { event: "ended", runId: "run-1" }),
    ])[0];

    expect(applyExperienceLifecycleEvent(run, wrongEnd)).toMatchObject({
      applied: false,
      run,
      conflict: 'Lifecycle "ended" da run other-run ignorado: a run ativa é run-1.',
    });
    expect(applyExperienceLifecycleEvent(run, matchingEnd)).toMatchObject({
      applied: true,
      run: {
        status: "ended",
        endedAt: "2026-04-26T12:00:10.000Z",
        runId: "run-1",
        source: "xr",
      },
    });
  });

  it("keeps an active local run when XR starts a conflicting lifecycle run", () => {
    const run = startExperienceRun("2026-04-26T12:00:00.000Z");
    const lifecycle = deriveExperienceLifecycleEvents([
      event("2026-04-26T12:00:03.000Z", { event: "started", runId: "xr-run", source: "xr" }),
    ])[0];

    expect(applyExperienceLifecycleEvent(run, lifecycle)).toMatchObject({
      applied: false,
      run,
      conflict: 'Lifecycle "started" da run xr-run ignorado: a run do dashboard está ativa.',
    });
  });

  it("keeps an active local run when XR ends an unrelated lifecycle run", () => {
    const run = startExperienceRun("2026-04-26T12:00:00.000Z");
    const lifecycle = deriveExperienceLifecycleEvents([
      event("2026-04-26T12:00:09.000Z", { event: "ended", runId: "xr-run" }),
    ])[0];

    expect(applyExperienceLifecycleEvent(run, lifecycle)).toMatchObject({
      applied: false,
      run,
      conflict: 'Lifecycle "ended" da run xr-run ignorado: a run do dashboard está ativa.',
    });
  });

  it("starts a new XR run after a previous run ended", () => {
    const previous = endExperienceRun(
      startExperienceRun("2026-04-26T12:00:00.000Z", { runId: "old-run", source: "xr" }),
      "2026-04-26T12:00:05.000Z",
    );
    const lifecycle = deriveExperienceLifecycleEvents([
      event("2026-04-26T12:00:10.000Z", { event: "started", runId: "new-run", source: "xr" }),
    ])[0];

    expect(applyExperienceLifecycleEvent(previous, lifecycle)).toMatchObject({
      applied: true,
      startedNewRun: true,
      run: {
        status: "running",
        runId: "new-run",
        startedAt: "2026-04-26T12:00:10.000Z",
      },
    });
  });

  it("preserves dashboard source when a local lifecycle echo starts the run", () => {
    const lifecycle = deriveExperienceLifecycleEvents([
      event("2026-04-26T12:00:01.000Z", {
        event: "started",
        runId: "dashboard-run",
        label: "Dashboard Experience",
        source: "dashboard",
      }, "dashboard-ui"),
    ])[0];

    expect(applyExperienceLifecycleEvent(resetExperienceRun(), lifecycle)).toMatchObject({
      applied: true,
      run: {
        status: "running",
        runId: "dashboard-run",
        source: "dashboard",
      },
    });
  });
});
