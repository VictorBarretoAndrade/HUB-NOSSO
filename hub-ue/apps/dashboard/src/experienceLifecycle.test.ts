import { describe, expect, it } from "vitest";
import {
  applyExperienceLifecycleEvent,
  deriveExperienceLifecycleEvents,
} from "./experienceLifecycle";
import { endExperienceRun, resetExperienceRun, startExperienceRun } from "./experienceRun";
import type { StreamEvent } from "./types";

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
      conflict: "Lifecycle ended for other-run ignored; active run is run-1.",
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
      conflict: "Lifecycle started for xr-run ignored; dashboard run is active.",
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
      conflict: "Lifecycle ended for xr-run ignored; dashboard run is active.",
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
});
