import { describe, expect, it } from "vitest";
import { activeSensorId, downsample, ecgEvents, flattenEcg, latestScalar, scalarSeries } from "./liveSignal";
import type { StreamEvent } from "./types";

function hrv(receivedAt: string, payload: Record<string, unknown>, clientId = "polar-h10"): StreamEvent {
  return { receivedAt, envelope: { type: "publish", topic: "hrv.raw", clientId, payload } };
}

// Eventos chegam newest-first (como em App.tsx).
const events: StreamEvent[] = [
  hrv("2026-06-21T00:00:02.000Z", { ecg: [3, 4], bpm: 74, rrMs: 810 }),
  hrv("2026-06-21T00:00:01.000Z", { ecg: [1, 2], bpm: 75, rrMs: 800 }),
  { receivedAt: "2026-06-21T00:00:00.500Z", envelope: { type: "publish", topic: "unreal.state", clientId: "ue", payload: {} } },
];

describe("liveSignal", () => {
  it("identifies the active sensor and filters hrv events", () => {
    expect(activeSensorId(events)).toBe("polar-h10");
    expect(ecgEvents(events)).toHaveLength(2);
    expect(ecgEvents(events, "other")).toHaveLength(0);
  });

  it("flattens ECG samples chronologically", () => {
    expect(flattenEcg(events, 100)).toEqual([1, 2, 3, 4]);
    expect(flattenEcg(events, 3)).toEqual([2, 3, 4]);
  });

  it("builds chronological scalar series and the latest value", () => {
    expect(scalarSeries(events, "bpm", 100)).toEqual([75, 74]);
    expect(scalarSeries(events, "rrMs", 100)).toEqual([800, 810]);
    expect(latestScalar(events, "bpm")).toBe(74);
  });

  it("downsamples to fit a target width", () => {
    expect(downsample([0, 1, 2, 3], 10)).toEqual([0, 1, 2, 3]);
    expect(downsample([0, 1, 2, 3, 4, 5], 3)).toEqual([0, 2, 4]);
  });
});
