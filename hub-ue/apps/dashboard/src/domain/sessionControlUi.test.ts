import { describe, expect, it } from "vitest";
import { buildSensorListRows, buildSessionControlTabs, summarizeRunHeader } from "./sessionControlUi";
import type { ManagedSensorView } from "./sensorManager";
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

function managedSensor(overrides: Partial<ManagedSensorView> = {}): ManagedSensorView {
  return {
    sensorId: "lsl-test-signal",
    adapterId: "lsl",
    source: "lsl",
    displayName: "Fallback LSL name",
    deviceType: "TestSignal",
    topics: ["lsl.raw"],
    state: "connected",
    armedForNextRun: false,
    previewSummary: "2 ch: 0.25 / 0.75",
    lslMetadata: {
      name: "Biofeedback Hub Test",
      type: "TestSignal",
      channelCount: 2,
      nominalSrateHz: 10,
    },
    lslSync: { status: "corrected", timeCorrectionSec: 0.02 },
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

    expect(header.experienceLabel).toBe("Em execução");
    expect(header.unrealLabel).toBe("Unreal: em execução");
    expect(header.sensorLabel).toBe("Heart Rate Sensor: transmitindo");
    expect(header.unrealDetail).toContain("unreal-quest-host");
  });

  it("prioritizes a connected managed LSL stream over legacy telemetry", () => {
    const header = summarizeRunHeader(
      { status: "running", startedAt: "2026-04-26T12:00:00.000Z", totalPausedMs: 0 },
      { state: "running" },
      [sensorSummary({ device: "Legacy Polar", bpm: 84, rrMs: 714.3 })],
      [managedSensor()],
    );

    expect(header.sensorLabel).toBe("Biofeedback Hub Test: conectado");
    expect(header.sensorDetail).toBe("LSL / 2 ch / 10 Hz / sync Corrected (+20 ms)");
    expect(header.sensorTone).toBe("ok");
  });

  it("shows recording before armed and connected managed sensors", () => {
    const header = summarizeRunHeader(
      { status: "running", startedAt: "2026-04-26T12:00:00.000Z", totalPausedMs: 0 },
      { state: "running" },
      [],
      [
        managedSensor({ sensorId: "lsl-connected", displayName: "Connected stream" }),
        managedSensor({ sensorId: "lsl-armed", displayName: "Armed stream", armedForNextRun: true }),
        managedSensor({
          sensorId: "lsl-recording",
          displayName: "Recording stream",
          state: "recording",
          attachedRunId: "run-001",
          recordingGateOpen: true,
          lslMetadata: { name: "Official stream" },
        }),
      ],
    );

    expect(header.sensorLabel).toBe("Official stream: gravando");
  });

  it("shows an armed managed sensor before the run starts", () => {
    const header = summarizeRunHeader(
      { status: "not_started", totalPausedMs: 0 },
      { state: "unknown" },
      [],
      [managedSensor({ armedForNextRun: true })],
    );

    expect(header.sensorLabel).toBe("Biofeedback Hub Test: armado");
    expect(header.sensorTone).toBe("ok");
  });

  it("prioritizes an armed managed sensor over a connected sensor", () => {
    const header = summarizeRunHeader(
      { status: "not_started", totalPausedMs: 0 },
      { state: "unknown" },
      [],
      [
        managedSensor({ sensorId: "lsl-connected", lslMetadata: { name: "Connected stream" } }),
        managedSensor({ sensorId: "lsl-armed", armedForNextRun: true, lslMetadata: { name: "Armed stream" } }),
      ],
    );

    expect(header.sensorLabel).toBe("Armed stream: armado");
  });

  it("treats an attached stale sensor with an open gate as recording", () => {
    const header = summarizeRunHeader(
      { status: "running", runId: "run-001", startedAt: "2026-04-26T12:00:00.000Z", totalPausedMs: 0 },
      { state: "running" },
      [],
      [managedSensor({ state: "stale", attachedRunId: "run-001", recordingGateOpen: true })],
    );

    expect(header.sensorLabel).toBe("Biofeedback Hub Test: gravando");
    expect(header.sensorTone).toBe("warn");
  });

  it("keeps legacy Polar telemetry as fallback when managed sensors are inactive", () => {
    const header = summarizeRunHeader(
      { status: "running", startedAt: "2026-04-26T12:00:00.000Z", totalPausedMs: 0 },
      { state: "running" },
      [sensorSummary({ device: "Polar H10", bpm: 72, rrMs: 833.3 })],
      [managedSensor({ state: "configured" })],
    );

    expect(header.sensorLabel).toBe("Polar H10: transmitindo");
    expect(header.sensorDetail).toBe("BPM 72 / RR 833.3 ms");
  });

  it("does not present a configured-only managed adapter as a live stream", () => {
    const header = summarizeRunHeader(
      { status: "not_started", totalPausedMs: 0 },
      { state: "unknown" },
      [],
      [managedSensor({ state: "configured" })],
    );

    expect(header.sensorLabel).toBe("Sem stream de sensor");
    expect(header.sensorDetail).toBe("Nenhuma amostra biométrica observada");
  });

  it("shows a neutral empty state when no sensor source exists", () => {
    const header = summarizeRunHeader(
      { status: "not_started", totalPausedMs: 0 },
      { state: "unknown" },
      [],
      [],
    );

    expect(header.sensorLabel).toBe("Sem stream de sensor");
    expect(header.sensorDetail).toBe("Nenhuma amostra biométrica observada");
    expect(header.sensorTone).toBe("muted");
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
        signalLabel: "Transmitindo",
        bpm: "85",
        rrMs: "714.3",
        ibiSampleCount: "2",
        samplesPerMinute: "59",
        lastUpdate: "há 1.2 s",
        topic: "hrv.raw",
      },
      {
        id: "sensor-stale",
        name: "sensor-stale",
        signalState: "stale",
        signalLabel: "Sem atualização",
        bpm: "--",
        rrMs: "--",
        ibiSampleCount: "1",
        samplesPerMinute: "--",
        lastUpdate: "há 7.0 s",
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
