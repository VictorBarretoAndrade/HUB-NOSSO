import { describe, expect, it } from "vitest";
import {
  MARKER_PRESETS,
  deriveTimelineFilterOptions,
  filterSessionTimeline,
  serializeTimelineCsv,
  serializeTimelineJson,
} from "./timelineTools";
import type { SessionTimelineItem } from "./markers";

function item(overrides: Partial<SessionTimelineItem>): SessionTimelineItem {
  return {
    id: "item-1",
    kind: "marker",
    title: "stimulus-start",
    detail: "source dashboard",
    tone: "ok",
    sourceClientId: "dashboard-ui",
    receivedAt: "2026-04-26T12:00:00.000Z",
    sessionTimeMs: 1200,
    ...overrides,
  };
}

describe("timeline tools", () => {
  const timeline = [
    item({
      id: "marker-dashboard",
      kind: "marker",
      title: "stimulus-start",
      detail: "first block; source dashboard",
      source: "dashboard",
      sourceClientId: "dashboard-ui",
      commandId: "cmd-marker",
    }),
    item({
      id: "marker-xr",
      kind: "marker",
      title: "interaction",
      detail: "button pressed; source xr",
      source: "xr",
      sourceClientId: "unreal-quest-host",
      receivedAt: "2026-04-26T12:00:01.000Z",
    }),
    item({
      id: "sensor-poor",
      kind: "biometric",
      title: "Sensor signal poor",
      detail: "sensor heart-rate-sensor-1; BPM 0; RR 737ms",
      tone: "warn",
      source: "heart-rate-sensor-1",
      sourceClientId: "heart-rate-sensor-1",
      receivedAt: "2026-04-26T12:00:03.000Z",
    }),
    item({
      id: "state-running",
      kind: "state",
      title: "Running",
      detail: "status online; fps 72",
      tone: "ok",
      source: "unreal-quest-host",
      sourceClientId: "unreal-quest-host",
      receivedAt: "2026-04-26T12:00:02.000Z",
    }),
  ] satisfies SessionTimelineItem[];

  it("derives compact source and kind options from timeline items", () => {
    expect(deriveTimelineFilterOptions(timeline)).toEqual({
      sources: ["dashboard", "heart-rate-sensor-1", "unreal-quest-host", "xr"],
      kinds: ["biometric", "marker", "state"],
    });
  });

  it("filters by source, kind, and free text", () => {
    const filtered = filterSessionTimeline(timeline, {
      source: "xr",
      kind: "marker",
      query: "button pressed",
    });

    expect(filtered.map((entry) => entry.id)).toEqual(["marker-xr"]);

    const biometricFiltered = filterSessionTimeline(timeline, {
      source: "heart-rate-sensor-1",
      kind: "biometric",
      query: "poor bpm",
    });

    expect(biometricFiltered.map((entry) => entry.id)).toEqual(["sensor-poor"]);
  });

  it("returns an empty list without mutating the original timeline when filters do not match", () => {
    const filtered = filterSessionTimeline(timeline, {
      source: "dashboard-ui",
      kind: "state",
      query: "missing",
    });

    expect(filtered).toEqual([]);
    expect(timeline).toHaveLength(4);
  });

  it("serializes timeline as stable JSON", () => {
    const json = serializeTimelineJson([timeline[0]]);

    expect(JSON.parse(json)).toEqual([
      {
        receivedAt: "2026-04-26T12:00:00.000Z",
        sessionTimeMs: 1200,
        kind: "marker",
        title: "stimulus-start",
        detail: "first block; source dashboard",
        source: "dashboard",
        sourceClientId: "dashboard-ui",
        commandId: "cmd-marker",
        tone: "ok",
      },
    ]);
  });

  it("serializes timeline as CSV with escaped commas, quotes, and newlines", () => {
    const csv = serializeTimelineCsv([
      item({
        title: "issue, quote",
        detail: "line one\n\"line two\"",
        commandId: "cmd-1",
      }),
    ]);

    expect(csv).toBe(
      [
        "receivedAt,sessionTimeMs,kind,title,detail,source,sourceClientId,commandId,tone",
        '2026-04-26T12:00:00.000Z,1200,marker,"issue, quote","line one\n""line two""",,dashboard-ui,cmd-1,ok',
      ].join("\n"),
    );
  });

  it("exposes quick marker presets without making them mandatory categories", () => {
    expect(MARKER_PRESETS).toEqual([
      "stimulus-start",
      "stimulus-end",
      "interaction",
      "checkpoint",
      "issue",
      "note",
    ]);
  });
});
