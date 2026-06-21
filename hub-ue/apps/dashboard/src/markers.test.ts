import { describe, expect, it } from "vitest";
import { deriveExperienceMarkers, deriveSessionTimeline, latestExperienceMarker } from "./markers";
import type { StreamEvent } from "./types";

function event(receivedAt: string, topic: string | null, payload: Record<string, unknown>, clientId = "unreal-quest-sim"): StreamEvent {
  return {
    receivedAt,
    envelope: {
      type: "publish",
      clientId,
      topic,
      sessionTimeMs: 1200,
      payload,
    },
  };
}

function hrvEvent(receivedAt: string, payload: Record<string, unknown>, clientId = "heart-rate-sensor-1"): StreamEvent {
  return event(receivedAt, "hrv.raw", payload, clientId);
}

describe("experience marker derivation", () => {
  it("derives marker summaries from experience.marker events", () => {
    const markers = deriveExperienceMarkers([
      event("2026-04-26T12:00:02.000Z", "experience.marker", {
        markerId: "marker-1",
        commandId: "cmd-1",
        label: "stimulus-start",
        note: "first block",
        source: "xr",
        reason: "trigger-volume",
      }),
      event("2026-04-26T12:00:01.000Z", "hrv.raw", { label: "ignore-me" }),
    ]);

    expect(markers).toEqual([
      {
        markerId: "marker-1",
        commandId: "cmd-1",
        label: "stimulus-start",
        note: "first block",
        source: "xr",
        reason: "trigger-volume",
        sourceClientId: "unreal-quest-sim",
        receivedAt: "2026-04-26T12:00:02.000Z",
        sessionTimeMs: 1200,
      },
    ]);
  });

  it("ignores marker events without a label", () => {
    expect(
      deriveExperienceMarkers([
        event("2026-04-26T12:00:02.000Z", "experience.marker", {
          markerId: "marker-1",
          label: "   ",
        }),
      ]),
    ).toEqual([]);
  });

  it("returns the latest marker by received time", () => {
    const marker = latestExperienceMarker([
      event("2026-04-26T12:00:01.000Z", "experience.marker", {
        markerId: "marker-1",
        label: "first",
      }),
      event("2026-04-26T12:00:03.000Z", "experience.marker", {
        markerId: "marker-2",
        label: "latest",
      }),
    ]);

    expect(marker?.label).toBe("latest");
  });

  it("deduplicates repeated marker events by marker id", () => {
    const markers = deriveExperienceMarkers([
      event("2026-04-26T12:00:03.000Z", "experience.marker", {
        markerId: "marker-1",
        commandId: "cmd-1",
        label: "stimulus-start",
        note: "latest copy",
      }),
      event("2026-04-26T12:00:02.000Z", "experience.marker", {
        markerId: "marker-1",
        commandId: "cmd-1",
        label: "stimulus-start",
        note: "older copy",
      }),
    ]);

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      markerId: "marker-1",
      note: "latest copy",
      receivedAt: "2026-04-26T12:00:03.000Z",
    });
  });

  it("combines state changes and markers into a newest-first session timeline", () => {
    const timeline = deriveSessionTimeline([
      event("2026-04-26T12:00:02.000Z", "unreal.state", {
        state: "paused",
        status: "idle",
        lastCommandId: "cmd-pause",
      }),
      event("2026-04-26T12:00:03.000Z", "experience.marker", {
        markerId: "marker-1",
        label: "door-opened",
        source: "xr",
      }),
      event("2026-04-26T12:00:01.000Z", "logger.events", {
        message: "ignore",
      }),
    ]);

    expect(timeline.map((item) => item.kind)).toEqual(["marker", "state"]);
    expect(timeline[0]).toMatchObject({
      kind: "marker",
      title: "door-opened",
      sourceClientId: "unreal-quest-sim",
    });
    expect(timeline[1]).toMatchObject({
      kind: "state",
      title: "Paused",
      detail: "status idle; command cmd-pause",
      tone: "warn",
    });
  });

  it("attaches the latest recent hrv.raw snapshot to marker timeline items", () => {
    const timeline = deriveSessionTimeline([
      hrvEvent("2026-04-26T12:00:02.000Z", {
        bpm: 84.2,
        rrMs: 714.29,
        ibiMs: [714],
        hrStatus: 1,
      }),
      event("2026-04-26T12:00:06.000Z", "experience.marker", {
        markerId: "marker-1",
        label: "stimulus-start",
        source: "xr",
      }),
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      kind: "marker",
      title: "stimulus-start",
      detail: "source xr; BPM 84; RR 714.3ms; IBI 1; signal streaming",
      biometricSnapshot: {
        sensorClientId: "heart-rate-sensor-1",
        bpm: 84,
        rrMs: 714.3,
        ibiSampleCount: 1,
        signalState: "streaming",
        sampleAgeMs: 4000,
        receivedAt: "2026-04-26T12:00:02.000Z",
      },
    });
  });

  it("attaches restored hrv.raw snapshots that only have ibiSampleCount", () => {
    const timeline = deriveSessionTimeline([
      hrvEvent("2026-04-26T12:00:02.000Z", {
        bpm: 84.2,
        rrMs: 714.29,
        ibiSampleCount: 2,
        hrStatus: 1,
      }),
      event("2026-04-26T12:00:06.000Z", "experience.marker", {
        markerId: "marker-1",
        label: "stimulus-start",
      }),
    ]);

    expect(timeline[0]).toMatchObject({
      kind: "marker",
      detail: "BPM 84; RR 714.3ms; IBI 2; signal streaming",
      biometricSnapshot: {
        ibiSampleCount: 2,
      },
    });
  });

  it("does not attach stale hrv.raw snapshots to marker timeline items", () => {
    const timeline = deriveSessionTimeline([
      hrvEvent("2026-04-26T12:00:00.000Z", {
        bpm: 84,
        rrMs: 714.29,
        hrStatus: 1,
      }),
      event("2026-04-26T12:00:06.000Z", "experience.marker", {
        markerId: "marker-1",
        label: "stimulus-start",
      }),
    ]);

    expect(timeline[0]).toMatchObject({
      kind: "marker",
      title: "stimulus-start",
      biometricSnapshot: undefined,
    });
  });

  it("derives rare biometric observations without listing every hrv.raw sample", () => {
    const timeline = deriveSessionTimeline([
      hrvEvent("2026-04-26T12:00:00.000Z", { bpm: 90, rrMs: 666.67, hrStatus: 1 }),
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 0, rrMs: 737, ibiMs: [739, 735], hrStatus: -10 }),
      hrvEvent("2026-04-26T12:00:03.000Z", { bpm: 0, rrMs: 731, ibiMs: [731], hrStatus: -10 }),
      hrvEvent("2026-04-26T12:00:05.000Z", { bpm: 92, rrMs: 652.17, hrStatus: 1 }),
      hrvEvent("2026-04-26T12:00:17.000Z", { bpm: 93, rrMs: 645.16, hrStatus: 1 }),
    ]);

    const biometricItems = timeline.filter((item) => item.kind === "biometric");
    expect(biometricItems.map((item) => item.title)).toEqual([
      "Sensor stream gap",
      "Sensor signal recovered",
      "Sensor signal poor",
    ]);
    expect(biometricItems[0].detail).toBe("sensor heart-rate-sensor-1; gap 12s; BPM 93; RR 645.2ms");
    expect(biometricItems[1].tone).toBe("ok");
    expect(biometricItems[2].tone).toBe("warn");
  });

  it("collapses repeated state heartbeats and rounds fps", () => {
    const timeline = deriveSessionTimeline([
      event("2026-04-26T12:00:04.000Z", "unreal.state", {
        state: "running",
        status: "online",
        fps: 71.98765,
      }),
      event("2026-04-26T12:00:03.000Z", "unreal.state", {
        state: "running",
        status: "online",
        fps: 71.12345,
      }),
      event("2026-04-26T12:00:02.000Z", "unreal.state", {
        state: "paused",
        status: "idle",
        fps: 0,
      }),
      event("2026-04-26T12:00:01.000Z", "unreal.state", {
        state: "paused",
        status: "idle",
        fps: 0,
      }),
    ]);

    expect(timeline).toHaveLength(2);
    expect(timeline.map((item) => item.title)).toEqual(["Running", "Paused"]);
    expect(timeline[0].detail).toBe("status online; fps 72");
  });
});
