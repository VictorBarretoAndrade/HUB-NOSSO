import { describe, expect, it } from "vitest";
import {
  deriveAnalyticSessionTimeline,
  endExperienceRun,
  experienceRunElapsedMs,
  formatExperienceTime,
  pauseExperienceRun,
  resetExperienceRun,
  resumeExperienceRun,
  serializeExperienceRunCsv,
  serializeExperienceRunJson,
  startExperienceRun,
  startNextExperienceRun,
  summarizeExperienceRun,
} from "./experienceRun";
import type { StreamEvent } from "./types";

function event(receivedAt: string, topic: string | null, payload: Record<string, unknown>, clientId = "unreal-quest-host"): StreamEvent {
  return {
    receivedAt,
    envelope: {
      type: "publish",
      clientId,
      topic,
      sessionTimeMs: 1000,
      payload,
    },
  };
}

function hrvEvent(receivedAt: string, payload: Record<string, unknown>, clientId = "heart-rate-sensor-1"): StreamEvent {
  return event(receivedAt, "hrv.raw", payload, clientId);
}

describe("experience run state", () => {
  it("starts a local run and filters out events before the start time", () => {
    const run = startExperienceRun("2026-04-26T12:00:10.000Z");
    const timeline = deriveAnalyticSessionTimeline(
      [
        event("2026-04-26T12:00:09.000Z", "experience.marker", { markerId: "before", label: "before" }),
        event("2026-04-26T12:00:11.500Z", "experience.marker", { markerId: "after", label: "after", source: "xr" }),
      ],
      run,
    );

    expect(run).toMatchObject({ status: "running", startedAt: "2026-04-26T12:00:10.000Z" });
    expect(timeline.map((item) => item.title)).toEqual(["after"]);
    expect(timeline[0]).toMatchObject({
      experienceTimeMs: 1500,
      phase: "running",
      realReceivedAt: "2026-04-26T12:00:11.500Z",
    });
  });

  it("includes lifecycle start and end events in the analytic timeline", () => {
    const run = endExperienceRun(
      startExperienceRun("2026-04-26T12:00:00.000Z", { runId: "run-1", source: "xr" }),
      "2026-04-26T12:00:10.000Z",
    );
    const timeline = deriveAnalyticSessionTimeline(
      [
        event("2026-04-26T12:00:00.000Z", "experience.lifecycle", {
          event: "started",
          runId: "run-1",
          label: "block A",
          source: "xr",
        }),
        event("2026-04-26T12:00:10.000Z", "experience.lifecycle", {
          event: "ended",
          runId: "run-1",
          reason: "complete",
          source: "xr",
        }),
      ],
      run,
    );

    expect(timeline.map((item) => [item.kind, item.title, item.experienceTimeMs, item.source])).toEqual([
      ["lifecycle", "Experience ended", 10000, "xr"],
      ["lifecycle", "Experience started", 0, "xr"],
    ]);
  });

  it("freezes experience time while an observed paused state is active", () => {
    const run = startExperienceRun("2026-04-26T12:00:00.000Z");
    const timeline = deriveAnalyticSessionTimeline(
      [
        event("2026-04-26T12:00:05.000Z", "unreal.state", { state: "paused", status: "idle" }),
        event("2026-04-26T12:00:08.000Z", "experience.marker", { markerId: "paused-marker", label: "issue", source: "xr" }),
      ],
      run,
    );

    expect(timeline[0]).toMatchObject({
      kind: "marker",
      title: "issue",
      phase: "paused",
      experienceTimeMs: 5000,
    });
  });

  it("resumes experience time after an observed running state and discounts paused duration", () => {
    const run = startExperienceRun("2026-04-26T12:00:00.000Z");
    const timeline = deriveAnalyticSessionTimeline(
      [
        event("2026-04-26T12:00:05.000Z", "unreal.state", { state: "paused", status: "idle" }),
        event("2026-04-26T12:00:08.000Z", "unreal.state", { state: "running", status: "online" }),
        event("2026-04-26T12:00:10.000Z", "experience.marker", { markerId: "running-marker", label: "checkpoint", source: "xr" }),
      ],
      run,
    );

    expect(timeline[0]).toMatchObject({
      kind: "marker",
      title: "checkpoint",
      phase: "running",
      experienceTimeMs: 7000,
    });
  });

  it("ends a run, fixes elapsed time, and ignores events after the end time", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:10.000Z");
    const timeline = deriveAnalyticSessionTimeline(
      [
        event("2026-04-26T12:00:06.000Z", "experience.marker", { markerId: "inside", label: "inside" }),
        event("2026-04-26T12:00:11.000Z", "experience.marker", { markerId: "outside", label: "outside" }),
      ],
      run,
    );

    expect(run.status).toBe("ended");
    expect(experienceRunElapsedMs(run, "2026-04-26T12:00:30.000Z")).toBe(10000);
    expect(timeline.map((item) => item.title)).toEqual(["inside"]);
  });

  it("tracks paused totals from observed pause and resume transitions", () => {
    const paused = pauseExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:05.000Z");
    const resumed = resumeExperienceRun(paused, "2026-04-26T12:00:09.000Z");

    expect(paused).toMatchObject({ status: "paused", pausedStartedAt: "2026-04-26T12:00:05.000Z" });
    expect(resumed).toMatchObject({ status: "running", totalPausedMs: 4000 });
    expect(experienceRunElapsedMs(resumed, "2026-04-26T12:00:12.000Z")).toBe(8000);
  });

  it("summarizes and exports analytic timeline items", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:10.000Z");
    const timeline = deriveAnalyticSessionTimeline(
      [
        event("2026-04-26T12:00:04.000Z", "unreal.state", { state: "running", status: "online" }),
        event("2026-04-26T12:00:06.000Z", "experience.marker", {
          markerId: "m1",
          label: "note, one",
          note: "line one\n\"line two\"",
          source: "dashboard",
        }),
      ],
      run,
    );

    expect(formatExperienceTime(61000)).toBe("00:01:01");
    expect(summarizeExperienceRun(run, timeline, "2026-04-26T12:00:12.000Z")).toMatchObject({
      status: "ended",
      markerCount: 1,
      stateChangeCount: 1,
      experienceTimeMs: 10000,
    });
    const json = JSON.parse(serializeExperienceRunJson(run, timeline, "2026-04-26T12:00:12.000Z"));
    expect(json).toMatchObject({
      exportedAt: "2026-04-26T12:00:12.000Z",
      summary: { markerCount: 1, stateChangeCount: 1 },
    });
    expect(json.items[0]).toMatchObject({ experienceTimeMs: 6000, experienceTime: "00:00:06", phase: "running" });
    expect(serializeExperienceRunCsv(run, timeline, "2026-04-26T12:00:12.000Z")).toContain(
      '2026-04-26T12:00:00.000Z,2026-04-26T12:00:10.000Z,6000,00:00:06,2026-04-26T12:00:06.000Z,marker,"note, one","line one\n""line two""; source dashboard",dashboard',
    );
  });

  it("exports marker biometric snapshots in JSON and CSV", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:10.000Z");
    const timeline = deriveAnalyticSessionTimeline(
      [
        hrvEvent("2026-04-26T12:00:04.000Z", {
          bpm: 84.2,
          rrMs: 714.29,
          ibiMs: [714],
          hrStatus: 1,
        }),
        event("2026-04-26T12:00:06.000Z", "experience.marker", {
          markerId: "m1",
          label: "stimulus-start",
          source: "xr",
        }),
      ],
      run,
    );

    const json = JSON.parse(serializeExperienceRunJson(run, timeline, "2026-04-26T12:00:12.000Z"));
    expect(json.items[0].biometricSnapshot).toMatchObject({
      sensorClientId: "heart-rate-sensor-1",
      bpm: 84,
      rrMs: 714.3,
      ibiSampleCount: 1,
      signalState: "streaming",
    });
    const csv = serializeExperienceRunCsv(run, timeline, "2026-04-26T12:00:12.000Z");
    expect(csv.split("\n")[0]).toContain("sensorClientId,bpm,rrMs,ibiSampleCount,sensorSignal");
    expect(csv).toContain("heart-rate-sensor-1,84,714.3,1,streaming");
  });

  it("resets back to not started for a new experience", () => {
    expect(resetExperienceRun()).toEqual({ status: "not_started", totalPausedMs: 0 });
  });

  it("starts the next experience in one action after an ended run", () => {
    const previous = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:10:00.000Z");
    const next = startNextExperienceRun(previous, "2026-04-26T12:11:00.000Z");

    expect(next).toEqual({
      status: "running",
      startedAt: "2026-04-26T12:11:00.000Z",
      source: "dashboard",
      totalPausedMs: 0,
    });
  });
});
