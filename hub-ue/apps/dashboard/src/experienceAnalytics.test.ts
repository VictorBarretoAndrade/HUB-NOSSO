import { describe, expect, it } from "vitest";
import {
  buildBiometricChartModel,
  deriveExperienceAnalytics,
  markerGroupExpansionLayout,
  markerGroupPopoverLayout,
  serializeBiometricsTimelineCsv,
} from "./experienceAnalytics";
import { endExperienceRun, startExperienceRun } from "./experienceRun";
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

describe("experience analytics", () => {
  it("derives biometric samples on the experience clock with pause ranges and marker overlays", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:20.000Z");
    const timelineEvents = [
      hrvEvent("2026-04-26T11:59:59.000Z", { bpm: 70, rrMs: 850, hrStatus: 1 }),
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 80, rrMs: 750, ibiMs: [750], hrStatus: 1, sequence: 1 }),
      event("2026-04-26T12:00:04.000Z", "experience.marker", { markerId: "m1", label: "stimulus-start", source: "xr" }),
      event("2026-04-26T12:00:05.000Z", "unreal.state", { state: "paused", status: "idle" }),
      hrvEvent("2026-04-26T12:00:07.000Z", { bpm: 90, rrMs: 666.7, ibiSampleCount: 2, hrStatus: 1, sequence: 2 }),
      event("2026-04-26T12:00:09.000Z", "unreal.state", { state: "running", status: "online" }),
      hrvEvent("2026-04-26T12:00:12.000Z", { bpm: 0, rrMs: 600, ibiMs: [600], hrStatus: -10, sequence: 3 }),
      event("2026-04-26T12:00:13.000Z", "experience.marker", { markerId: "m2", label: "issue", note: "felt delay", source: "dashboard" }),
      hrvEvent("2026-04-26T12:00:21.000Z", { bpm: 100, rrMs: 600, hrStatus: 1 }),
    ];

    const analytics = deriveExperienceAnalytics(run, timelineEvents);

    expect(analytics.pauseRanges).toEqual([
      {
        realStartedAt: "2026-04-26T12:00:05.000Z",
        realEndedAt: "2026-04-26T12:00:09.000Z",
        startExperienceTimeMs: 5000,
        endExperienceTimeMs: 5000,
      },
    ]);
    expect(analytics.markers.map((marker) => [marker.label, marker.experienceTimeMs, marker.source])).toEqual([
      ["stimulus-start", 4000, "xr"],
      ["issue", 9000, "dashboard"],
    ]);
    expect(analytics.sensors).toHaveLength(1);
    expect(analytics.sensors[0]).toMatchObject({
      sensorClientId: "heart-rate-sensor-1",
      stats: {
        bpmMin: 80,
        bpmAvg: 85,
        bpmMax: 90,
        rrAvgMs: 672.2,
        sampleCount: 3,
        poorSignalCount: 1,
        gapCount: 0,
      },
    });
    expect(analytics.sensors[0].samples.map((sample) => [sample.experienceTimeMs, sample.phase, sample.bpm, sample.signal])).toEqual([
      [2000, "running", 80, "streaming"],
      [5000, "paused", 90, "streaming"],
      [8000, "running", 0, "poor"],
    ]);
  });

  it("deduplicates repeated marker events by commandId or markerId", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:20.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      event("2026-04-26T12:00:04.000Z", "experience.marker", {
        markerId: "marker-1",
        commandId: "cmd-1",
        label: "stimulus-end",
      }),
      event("2026-04-26T12:00:04.100Z", "experience.marker", {
        markerId: "marker-1",
        commandId: "cmd-1",
        label: "stimulus-end",
      }),
      event("2026-04-26T12:00:05.000Z", "experience.marker", {
        markerId: "marker-2",
        label: "checkpoint",
      }),
      event("2026-04-26T12:00:05.200Z", "experience.marker", {
        markerId: "marker-2",
        label: "checkpoint",
      }),
    ]);

    expect(analytics.markers.map((marker) => [marker.markerId, marker.commandId, marker.label])).toEqual([
      ["marker-1", "cmd-1", "stimulus-end"],
      ["marker-2", undefined, "checkpoint"],
    ]);
  });

  it("serializes a focused biometrics timeline CSV with stable escaped columns", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:10.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 84.2, rrMs: 714.29, ibiSampleCount: 3, hrStatus: 1, sequence: 10 }, "sensor,one"),
    ]);

    expect(serializeBiometricsTimelineCsv(analytics)).toContain(
      'sensorClientId,experienceTimeMs,experienceTime,receivedAt,bpm,rrMs,hrStatus,signal,sequence,phase\n"sensor,one",2000,00:00:02,2026-04-26T12:00:02.000Z,84,714.3,1,streaming,10,running',
    );
  });

  it("builds separate chart lanes for BPM and RR instead of overlaying incompatible scales", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:12.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 80, rrMs: 750, hrStatus: 1 }),
      event("2026-04-26T12:00:04.000Z", "experience.marker", { markerId: "m1", label: "stimulus-start" }),
      event("2026-04-26T12:00:05.000Z", "unreal.state", { state: "paused" }),
      hrvEvent("2026-04-26T12:00:07.000Z", { bpm: 90, rrMs: 666.7, hrStatus: 1 }),
      event("2026-04-26T12:00:09.000Z", "unreal.state", { state: "running" }),
    ]);

    const model = buildBiometricChartModel({
      analytics,
      durationMs: 12000,
      sensorId: "heart-rate-sensor-1",
    });

    expect(model.lanes.map((lane) => [lane.id, lane.label, lane.points.length])).toEqual([
      ["bpm", "BPM", 2],
      ["rrMs", "RR ms", 2],
    ]);
    expect(model.lanes[0].points[1]).toMatchObject({ phase: "paused", signal: "streaming" });
    expect(model.lanes[0].plot.y).toBeLessThan(model.lanes[1].plot.y);
    expect(model.markerGroups).toEqual([
      expect.objectContaining({
        displayLabel: "stimulus-st...",
        isCluster: false,
        markers: [expect.objectContaining({ label: "stimulus-start", x: expect.any(Number) })],
      }),
    ]);
    expect(model.pauseMarkers).toEqual([
      expect.objectContaining({
        x: expect.any(Number),
        label: "Paused",
        startExperienceTimeMs: 5000,
      }),
    ]);
  });

  it("positions lane titles away from min and max value labels", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:12.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 70, rrMs: 860, hrStatus: 1 }),
      hrvEvent("2026-04-26T12:00:07.000Z", { bpm: 76, rrMs: 790, hrStatus: 1 }),
    ]);

    const model = buildBiometricChartModel({
      analytics,
      durationMs: 12000,
      sensorId: "heart-rate-sensor-1",
    });

    for (const lane of model.lanes) {
      expect(lane.labelPosition.x).toBeLessThan(lane.plot.x - 20);
      expect(lane.labelPosition.y).toBeGreaterThan(lane.plot.y + 20);
      expect(lane.labelPosition.y).toBeLessThan(lane.plot.y + lane.plot.height - 12);
    }
  });

  it("builds trend segments and breaks lines across biometric gaps", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:30.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 80, rrMs: 750, hrStatus: 1 }),
      hrvEvent("2026-04-26T12:00:04.000Z", { bpm: 84, rrMs: 714.3, hrStatus: 1 }),
      hrvEvent("2026-04-26T12:00:16.000Z", { bpm: 92, rrMs: 652.2, hrStatus: -8 }),
      event("2026-04-26T12:00:17.000Z", "unreal.state", { state: "paused" }),
      hrvEvent("2026-04-26T12:00:18.000Z", { bpm: 94, rrMs: 638.3, hrStatus: 1 }),
    ]);

    const model = buildBiometricChartModel({ analytics, durationMs: 30000, sensorId: "heart-rate-sensor-1" });
    const bpmLane = model.lanes[0];
    const firstStep = bpmLane.segments[0];
    const secondStep = bpmLane.segments[1];

    expect(bpmLane.segments).toHaveLength(2);
    expect(firstStep.path).toBe(`M ${bpmLane.points[0].x} ${bpmLane.points[0].y} L ${bpmLane.points[1].x} ${bpmLane.points[1].y}`);
    expect(firstStep.tone).toBe("normal");
    expect(secondStep.path).toBe(`M ${bpmLane.points[2].x} ${bpmLane.points[2].y} L ${bpmLane.points[3].x} ${bpmLane.points[3].y}`);
    expect(secondStep.tone).toBe("paused");
    expect(bpmLane.points[2]).toMatchObject({ signal: "poor", phase: "running" });
    expect(bpmLane.points[3]).toMatchObject({ signal: "streaming", phase: "paused" });
  });

  it("cleans invalid metric values and aggregates dense sessions for chart readability", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:05:00.000Z");
    const events = Array.from({ length: 301 }, (_, index) =>
      hrvEvent(new Date(Date.parse("2026-04-26T12:00:00.000Z") + index * 1000).toISOString(), {
        bpm: index % 60 === 0 ? 0 : 105 + (index % 12),
        rrMs: 500 + (index % 20),
        hrStatus: index % 60 === 0 ? -8 : 1,
        sequence: index,
      }),
    );

    const model = buildBiometricChartModel({
      analytics: deriveExperienceAnalytics(run, events),
      durationMs: 300000,
      sensorId: "heart-rate-sensor-1",
    });
    const bpmLane = model.lanes[0];

    expect(bpmLane.rawPointCount).toBeGreaterThan(250);
    expect(bpmLane.isAggregated).toBe(true);
    expect(bpmLane.points.length).toBeLessThanOrEqual(120);
    expect(bpmLane.points.some((point) => point.value === 0)).toBe(false);
    expect(bpmLane.domain[0]).toBeGreaterThan(80);
    expect(bpmLane.showDots).toBe(false);
  });

  it("clusters nearby marker labels and preserves every marker for callouts", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:30.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      hrvEvent("2026-04-26T12:00:09.900Z", { bpm: 84, rrMs: 714, hrStatus: 1 }),
      event("2026-04-26T12:00:10.000Z", "experience.marker", { markerId: "m1", label: "stimulus-start-long-label", source: "xr" }),
      event("2026-04-26T12:00:10.300Z", "experience.marker", { markerId: "m2", label: "interaction", source: "dashboard" }),
      event("2026-04-26T12:00:10.600Z", "experience.marker", { markerId: "m3", label: "issue" }),
    ]);

    const model = buildBiometricChartModel({ analytics, durationMs: 30000 });

    expect(model.markerGroups).toHaveLength(1);
    expect(model.markerGroups[0]).toMatchObject({
      displayLabel: "3 markers",
      isCluster: true,
      markers: [
        expect.objectContaining({ markerId: "m1", label: "stimulus-start-long-label", shortLabel: "stimulus-st...", source: "xr", bpm: 84, rrMs: 714 }),
        expect.objectContaining({ markerId: "m2", label: "interaction", source: "dashboard" }),
        expect.objectContaining({ markerId: "m3", label: "issue" }),
      ],
    });
    const expansion = markerGroupExpansionLayout(model.markerGroups[0]);

    expect(expansion).not.toBeNull();
    expect(expansion?.items.map((item) => item.markerId)).toEqual(["m1", "m2", "m3"]);
    expect(expansion?.items[0]).toMatchObject({
      label: "stimulus-s...",
      fullLabel: "stimulus-start-long-label",
    });
    for (const item of expansion?.items ?? []) {
      expect(item.x).toBeGreaterThanOrEqual(expansion!.x);
      expect(item.x + item.width).toBeLessThanOrEqual(expansion!.x + expansion!.width);
    }
  });

  it("keeps spaced marker groups readable without horizontal collision", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:02:00.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      event("2026-04-26T12:00:10.000Z", "experience.marker", { markerId: "m1", label: "stimulus-start-long-label" }),
      event("2026-04-26T12:00:45.000Z", "experience.marker", { markerId: "m2", label: "interaction" }),
      event("2026-04-26T12:01:20.000Z", "experience.marker", { markerId: "m3", label: "checkpoint" }),
      event("2026-04-26T12:01:55.000Z", "experience.marker", { markerId: "m4", label: "stimulus-end" }),
    ]);

    const model = buildBiometricChartModel({ analytics, durationMs: 120000 });

    expect(model.markerGroups.map((group) => [group.displayLabel, group.isCluster])).toEqual([
      ["stimulus-st...", false],
      ["interaction", false],
      ["checkpoint", false],
      ["stimulus-end", false],
    ]);

    for (const group of model.markerGroups) {
      expect(group.labelX).toBeGreaterThanOrEqual(54);
      expect(group.labelX + group.labelWidth).toBeLessThanOrEqual(698);
    }

    const rows = new Map<number, typeof model.markerGroups>();
    for (const group of model.markerGroups) {
      rows.set(group.labelY, [...(rows.get(group.labelY) ?? []), group]);
    }
    for (const rowGroups of rows.values()) {
      const sorted = [...rowGroups].sort((left, right) => left.labelX - right.labelX);
      for (let index = 1; index < sorted.length; index += 1) {
        expect(sorted[index].labelX).toBeGreaterThanOrEqual(sorted[index - 1].labelX + sorted[index - 1].labelWidth + 6);
      }
    }
  });

  it("places marker group popovers inside the chart and above the marker rail", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:01:00.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      event("2026-04-26T12:00:01.000Z", "experience.marker", { markerId: "early", label: "early-marker" }),
      event("2026-04-26T12:00:59.000Z", "experience.marker", { markerId: "late", label: "late-marker" }),
    ]);
    const model = buildBiometricChartModel({ analytics, durationMs: 60000 });

    const earlyPopover = markerGroupPopoverLayout(model.markerGroups[0]);
    const latePopover = markerGroupPopoverLayout(model.markerGroups[1]);

    expect(earlyPopover.x).toBeGreaterThanOrEqual(54);
    expect(earlyPopover.y + earlyPopover.height).toBeLessThan(model.markerGroups[0].labelY);
    expect(latePopover.x + latePopover.width).toBeLessThanOrEqual(698);
    expect(latePopover.y + latePopover.height).toBeLessThan(model.markerGroups[1].labelY);
  });

  it("sizes marker popovers for stacked marker details instead of a single compressed row", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:20.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      hrvEvent("2026-04-26T12:00:03.500Z", { bpm: 81, rrMs: 740.7, hrStatus: 1 }),
      event("2026-04-26T12:00:04.000Z", "experience.marker", { markerId: "m1", label: "stimulus-start" }),
    ]);
    const model = buildBiometricChartModel({ analytics, durationMs: 20000 });
    const layout = markerGroupPopoverLayout(model.markerGroups[0]);

    expect(layout.width).toBeGreaterThanOrEqual(260);
    expect(layout.height).toBeGreaterThanOrEqual(78);
  });

  it("builds inline expansion trays only for clustered groups", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:01:00.000Z");
    const analytics = deriveExperienceAnalytics(run, [
      event("2026-04-26T12:00:02.000Z", "experience.marker", { markerId: "m1", label: "stimulus-start" }),
      event("2026-04-26T12:00:02.200Z", "experience.marker", { markerId: "m2", label: "interaction" }),
      event("2026-04-26T12:00:50.000Z", "experience.marker", { markerId: "m3", label: "checkpoint" }),
    ]);
    const model = buildBiometricChartModel({ analytics, durationMs: 60000 });

    const clusteredTray = markerGroupExpansionLayout(model.markerGroups[0]);
    const singleTray = markerGroupExpansionLayout(model.markerGroups[1]);

    expect(clusteredTray).toMatchObject({
      items: [
        expect.objectContaining({ markerId: "m1", label: "stimulus-s..." }),
        expect.objectContaining({ markerId: "m2", label: "interaction" }),
      ],
    });
    expect(clusteredTray?.x).toBeGreaterThanOrEqual(54);
    expect((clusteredTray?.x ?? 0) + (clusteredTray?.width ?? 0)).toBeLessThanOrEqual(698);
    expect(singleTray).toBeNull();
  });
});
