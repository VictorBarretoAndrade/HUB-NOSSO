import { describe, expect, it } from "vitest";
import { buildSensorListRows, buildSessionControlTabs, summarizeRunHeader } from "./sessionControlUi";
import type { SensorTelemetrySummary } from "./sensorTelemetry";

function sensorSummary(overrides: Partial<SensorTelemetrySummary>): SensorTelemetrySummary {
  return {
    clientId: "heart-rate-sensor-1",
    ibiSampleCount: 1,
    sampleCount: 1,
    signalState: "streaming",
    ...overrides,
  };
}

describe("session control UI helpers", () => {
  it("builds compact run header chips without duplicating the experience state", () => {
    const header = summarizeRunHeader(
      { status: "running", startedAt: "2026-04-26T12:00:00.000Z", totalPausedMs: 0 },
      { state: "running", sourceClientId: "unreal-quest-host", receivedAt: "2026-04-26T12:00:03.000Z" },
      [sensorSummary({ device: "Heart Rate Sensor", bpm: 84, rrMs: 714.3 })],
    );

    expect(header.experienceLabel).toBe("Running");
    expect(header.unrealLabel).toBe("Unreal running");
    expect(header.sensorLabel).toBe("Heart Rate Sensor streaming");
    expect(header.unrealDetail).toContain("unreal-quest-host");
  });

  it("builds scalable sensor list rows from telemetry summaries", () => {
    const rows = buildSensorListRows([
      sensorSummary({
        clientId: "heart-rate-sensor-1",
        device: "Heart Rate Sensor",
        bpm: 84.7,
        rrMs: 714.34,
        ibiSampleCount: 2,
        samplesPerMinute: 58.6,
        topic: "hrv.raw",
        lastSampleAgeMs: 1200,
      }),
      sensorSummary({
        clientId: "sensor-stale",
        signalState: "stale",
        lastSampleAgeMs: 7000,
      }),
    ]);

    expect(rows).toEqual([
      {
        id: "heart-rate-sensor-1",
        name: "Heart Rate Sensor",
        signalState: "streaming",
        signalLabel: "Streaming",
        bpm: "85",
        rrMs: "714.3",
        ibiSampleCount: "2",
        samplesPerMinute: "59",
        lastUpdate: "1.2s ago",
        topic: "hrv.raw",
      },
      {
        id: "sensor-stale",
        name: "sensor-stale",
        signalState: "stale",
        signalLabel: "Stale",
        bpm: "--",
        rrMs: "--",
        ibiSampleCount: "1",
        samplesPerMinute: "--",
        lastUpdate: "7.0s ago",
        topic: "--",
      },
    ]);
  });

  it("only exposes the report tab after the experience ends", () => {
    expect(buildSessionControlTabs("running", 3, 1, 2).map((tab) => tab.id)).toEqual([
      "operate",
      "timeline",
      "sensors",
      "history",
    ]);
    expect(buildSessionControlTabs("ended", 3, 1, 2).map((tab) => tab.id)).toEqual([
      "operate",
      "timeline",
      "sensors",
      "history",
      "report",
    ]);
  });
});
