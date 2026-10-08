import { describe, expect, it } from "vitest";
import {
  deriveSensorDataStream,
  deriveSensorTelemetrySummaries,
  formatSensorAge,
  formatSensorDelay,
  isSensorClient,
  sensorSignalLabel,
  sensorSignalTone,
  serializeSensorDataStreamJson,
} from "./sensorTelemetry";
import type { HubClient, StreamEvent } from "./types";

const now = "2026-04-26T18:42:20.000Z";

function sensorClient(clientId = "heart-rate-sensor-1"): HubClient {
  return {
    clientId,
    role: "sensor",
    capabilities: ["heart-rate", "ibi", "generic-heart-rate-websocket"],
    subscriptions: [],
    outboxSize: 0,
  };
}

function hrvEvent(
  receivedAt: string,
  payload: Record<string, unknown>,
  clientId = "heart-rate-sensor-1",
): StreamEvent {
  return {
    receivedAt,
    envelope: {
      type: "publish",
      topic: "hrv.raw",
      clientId,
      payload,
    },
  };
}

describe("sensor telemetry summaries", () => {
  it("derives an unknown sensor when the connected sensor has no observed events", () => {
    expect(deriveSensorTelemetrySummaries([sensorClient()], [], now)).toEqual([
      expect.objectContaining({
        clientId: "heart-rate-sensor-1",
        ibiSampleCount: 0,
        sampleCount: 0,
        signalState: "unknown",
      }),
    ]);
  });

  it("derives a streaming hrv.raw summary from a recent good sample", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        hrvEvent("2026-04-26T18:42:18.000Z", {
          bpm: 96.6,
          rrMs: 618.56,
          ibiMs: [610, 621],
          hrStatus: 1,
          sequence: 42,
          source: "generic-heart-rate-websocket",
          device: "heart-rate-sensor-1",
        }),
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      clientId: "heart-rate-sensor-1",
      device: "heart-rate-sensor-1",
      source: "generic-heart-rate-websocket",
      topic: "hrv.raw",
      bpm: 97,
      rrMs: 618.6,
      ibiSampleCount: 2,
      hrStatus: 1,
      sequence: 42,
      lastSampleAgeMs: 2000,
      sampleCount: 1,
      signalState: "streaming",
    });
  });

  it("ignores sensor manager preview events in legacy telemetry summaries", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [],
      [
        {
          receivedAt: "2026-04-26T18:42:18.000Z",
          envelope: {
            type: "publish",
            topic: "sensor.preview",
            clientId: "sensor-manager",
            payload: {
              sensorId: "sim-hrv-1",
              sample: { bpm: 72, rrMs: 833.3 },
            },
          },
        },
      ],
      now,
    );

    expect(summaries).toEqual([]);
  });

  it("does not classify the internal Sensor Manager client as a physical sensor", () => {
    const manager: HubClient = {
      clientId: "sensor-manager",
      role: "system",
      capabilities: ["sensor-manager"],
      subscriptions: ["sensor.commands", "experience.lifecycle"],
      outboxSize: 0,
    };

    expect(isSensorClient(manager)).toBe(false);
    expect(deriveSensorTelemetrySummaries([manager], [], now)).toEqual([]);
  });

  it("uses the managed sensor identity for hrv.raw while excluding manager control events", () => {
    const manager: HubClient = {
      clientId: "sensor-manager",
      role: "system",
      capabilities: ["sensor-manager"],
      subscriptions: ["sensor.commands"],
      outboxSize: 0,
    };
    const event = hrvEvent(
      "2026-04-26T18:42:19.000Z",
      { sensorId: "sim-hrv-1", runId: "run-1", bpm: 72, rrMs: 833.3 },
      "sensor-manager",
    );

    expect(deriveSensorTelemetrySummaries([manager], [event], now)).toMatchObject([
      {
        clientId: "sim-hrv-1",
        topic: "hrv.raw",
        bpm: 72,
        signalState: "streaming",
      },
    ]);
    expect(deriveSensorTelemetrySummaries([], [event], now)).toMatchObject([
      expect.objectContaining({ clientId: "sim-hrv-1" }),
    ]);
    expect(deriveSensorDataStream([manager], [event], 30, [
      { sensorId: "sim-hrv-1", displayName: "Simulated HRV", deviceType: "hrv" },
    ])).toMatchObject({
      rows: [expect.objectContaining({
        clientId: "sim-hrv-1",
        displayName: "Simulated HRV",
        deviceType: "hrv",
        topic: "hrv.raw",
      })],
      totalSamples: 1,
      clientCount: 1,
      topicCount: 1,
    });
  });

  it("excludes the internal manager while preserving a physical Polar client", () => {
    const manager: HubClient = {
      clientId: "sensor-manager",
      role: "system",
      capabilities: ["sensor-manager"],
      subscriptions: ["sensor.commands"],
      outboxSize: 0,
    };
    const summaries = deriveSensorTelemetrySummaries(
      [manager, sensorClient("polar-h10")],
      [hrvEvent("2026-04-26T18:42:19.000Z", { bpm: 72, rrMs: 833.3 }, "polar-h10")],
      now,
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].clientId).toBe("polar-h10");
  });

  it("marks the sensor stale when the latest sample is older than five seconds", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [hrvEvent("2026-04-26T18:42:10.000Z", { bpm: 90, rrMs: 666.67, hrStatus: 1 })],
      now,
    );

    expect(summaries[0]).toMatchObject({
      signalState: "stale",
      lastSampleAgeMs: 10000,
    });
    expect(summaries[0].bpm).toBeUndefined();
    expect(summaries[0].rrMs).toBeUndefined();
  });

  it("marks the sensor poor and derives BPM from RR when the sensor sends IBI-only samples", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [hrvEvent("2026-04-26T18:42:19.000Z", { bpm: 0, rrMs: 737, ibiMs: [739, 735], hrStatus: -10 })],
      now,
    );

    expect(summaries[0]).toMatchObject({
      bpm: 81,
      ibiSampleCount: 2,
      signalState: "poor",
    });
  });

  it("uses the latest event per sensor and computes a compact sample rate", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        hrvEvent("2026-04-26T18:42:18.000Z", { bpm: 90, rrMs: 666.67, hrStatus: 1, sequence: 2 }),
        hrvEvent("2026-04-26T18:41:18.000Z", { bpm: 80, rrMs: 750, hrStatus: 1, sequence: 1 }),
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      bpm: 90,
      sequence: 2,
      sampleCount: 2,
      samplesPerMinute: 2,
    });
  });

  it("separates source age, Hub delay, browser age, and sequence gaps", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        {
          receivedAt: "2026-04-26T18:42:19.900Z",
          envelope: {
            type: "publish",
            topic: "hrv.raw",
            clientId: "heart-rate-sensor-1",
            collectedAt: "2026-04-26T18:42:19.500Z",
            hubReceivedAt: "2026-04-26T18:42:19.750Z",
            payload: { bpm: 72, rrMs: 833.3, sequence: 1 },
          },
        },
        {
          receivedAt: "2026-04-26T18:42:19.950Z",
          envelope: {
            type: "publish",
            topic: "hrv.raw",
            clientId: "heart-rate-sensor-1",
            collectedAt: "2026-04-26T18:42:19.600Z",
            hubReceivedAt: "2026-04-26T18:42:19.850Z",
            payload: { bpm: 72, rrMs: 833.3, sequence: 3 },
          },
        },
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      lastSampleAgeMs: 150,
      browserAgeMs: 50,
      hubAgeMs: 150,
      transportDelayMs: 250,
      sequenceGapCount: 1,
    });
    expect(formatSensorDelay(250)).toBe("250 ms");
    expect(formatSensorDelay(1250)).toBe("1.3 s");
  });

  it("uses Hub receipt freshness when the source timestamp is ahead of the browser clock", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        {
          receivedAt: "2026-04-26T18:42:19.950Z",
          envelope: {
            type: "publish",
            topic: "hrv.raw",
            clientId: "heart-rate-sensor-1",
            collectedAt: "2026-04-26T18:42:25.000Z",
            hubReceivedAt: "2026-04-26T18:42:10.000Z",
            payload: { bpm: 72, rrMs: 833.3, sequence: 7 },
          },
        },
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      lastSampleAgeMs: 10000,
      browserAgeMs: 50,
      hubAgeMs: 10000,
      signalState: "stale",
    });
    expect(summaries[0].bpm).toBeUndefined();
    expect(summaries[0].rrMs).toBeUndefined();
  });

  it("holds the last valid BPM and RR while recent ECG packets keep advancing", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        hrvEvent("2026-04-26T18:42:19.100Z", { ecg: [0.02, 0.04], sequence: 44 }),
        hrvEvent("2026-04-26T18:42:18.550Z", { ecg: [0.01, 0.03], sequence: 43 }),
        hrvEvent("2026-04-26T18:42:18.000Z", {
          bpm: 96.6,
          rrMs: 618.56,
          ecg: [0.01, 0.02],
          sequence: 42,
        }),
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      bpm: 97,
      rrMs: 618.6,
      sequence: 44,
      lastSampleAgeMs: 900,
      sampleCount: 3,
      signalState: "streaming",
    });
  });

  it("expires held BPM and RR even while newer ECG packets remain active", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        hrvEvent("2026-04-26T18:42:19.000Z", { ecg: [0.02, 0.04], sequence: 52 }),
        hrvEvent("2026-04-26T18:42:14.000Z", { bpm: 80, rrMs: 750, ecg: [0.01, 0.03], sequence: 51 }),
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      sequence: 52,
      lastSampleAgeMs: 1000,
      signalState: "streaming",
    });
    expect(summaries[0].bpm).toBeUndefined();
    expect(summaries[0].rrMs).toBeUndefined();
  });

  it("does not carry BPM or RR across a sequence reset", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        hrvEvent("2026-04-26T18:42:19.000Z", { ecg: [0.02, 0.04], sequence: 1 }),
        hrvEvent("2026-04-26T18:42:18.000Z", { bpm: 90, rrMs: 666.67, ecg: [0.01, 0.03], sequence: 42 }),
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      sequence: 1,
      sequenceGapCount: 0,
      signalState: "streaming",
    });
    expect(summaries[0].bpm).toBeUndefined();
    expect(summaries[0].rrMs).toBeUndefined();
  });

  it("does not carry BPM or RR without recent ECG sequence evidence", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        hrvEvent("2026-04-26T18:42:19.000Z", { ecg: [0.02, 0.04] }),
        hrvEvent("2026-04-26T18:42:18.000Z", { bpm: 90, rrMs: 666.67, ecg: [0.01, 0.03], sequence: 42 }),
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({ signalState: "streaming" });
    expect(summaries[0].sequence).toBeUndefined();
    expect(summaries[0].bpm).toBeUndefined();
    expect(summaries[0].rrMs).toBeUndefined();
  });

  it("does not carry BPM or RR over an hrStatus zero packet without a valid metric", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        hrvEvent("2026-04-26T18:42:19.000Z", { ecg: [0.02, 0.04], hrStatus: 0, sequence: 43 }),
        hrvEvent("2026-04-26T18:42:18.000Z", { bpm: 90, rrMs: 666.67, ecg: [0.01, 0.03], sequence: 42 }),
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      sequence: 43,
      signalState: "poor",
    });
    expect(summaries[0].bpm).toBeUndefined();
    expect(summaries[0].rrMs).toBeUndefined();
  });

  it("holds BPM and RR independently when the sensor updates them in separate packets", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        hrvEvent("2026-04-26T18:42:19.000Z", { bpm: 92, ecg: [0.02, 0.04], sequence: 43 }),
        hrvEvent("2026-04-26T18:42:18.000Z", { rrMs: 652.17, ecg: [0.01, 0.03], sequence: 42 }),
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      bpm: 92,
      rrMs: 652.2,
      sequence: 43,
      signalState: "streaming",
    });
  });

  it("does not carry BPM or RR over an explicit poor-signal packet", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient()],
      [
        hrvEvent("2026-04-26T18:42:19.000Z", { ecg: [0.02, 0.04], hrStatus: -10, sequence: 43 }),
        hrvEvent("2026-04-26T18:42:18.000Z", { bpm: 90, rrMs: 666.67, ecg: [0.01, 0.03], sequence: 42 }),
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      sequence: 43,
      signalState: "poor",
    });
    expect(summaries[0].bpm).toBeUndefined();
    expect(summaries[0].rrMs).toBeUndefined();
  });

  it("summarizes generic sensor topics from connected sensor clients", () => {
    const summaries = deriveSensorTelemetrySummaries(
      [sensorClient("imu-node-1")],
      [
        {
          receivedAt: "2026-04-26T18:42:18.000Z",
          envelope: {
            type: "publish",
            topic: "imu.accelerometer.raw",
            clientId: "imu-node-1",
            payload: { x: 0.12, y: -0.03, z: 0.98, device: "IMU Node 1" },
          },
        },
      ],
      now,
    );

    expect(summaries[0]).toMatchObject({
      clientId: "imu-node-1",
      device: "IMU Node 1",
      topic: "imu.accelerometer.raw",
      sampleCount: 1,
      ibiSampleCount: 0,
      signalState: "streaming",
    });
  });

  it("formats signal tone, label, and age for compact UI", () => {
    expect(sensorSignalTone("streaming")).toBe("ok");
    expect(sensorSignalTone("stale")).toBe("warn");
    expect(sensorSignalTone("poor")).toBe("error");
    expect(sensorSignalTone("unknown")).toBe("muted");
    expect(sensorSignalLabel("poor")).toBe("Sinal ruim");
    expect(formatSensorAge(undefined)).toBe("--");
    expect(formatSensorAge(2400)).toBe("há 2 s");
    expect(formatSensorAge(65000)).toBe("há 1 min");
  });
});

describe("sensor data stream snapshots", () => {
  it("recognizes generic sensor payloads from connected sensor clients", () => {
    const snapshot = deriveSensorDataStream(
      [
        {
          ...sensorClient("imu-node-1"),
          displayName: "Vest IMU",
          deviceType: "imu",
        },
      ],
      [
        {
          receivedAt: "2026-04-26T18:42:19.000Z",
          envelope: {
            type: "publish",
            topic: "imu.accelerometer.raw",
            clientId: "imu-node-1",
            payload: { x: 0.12, y: -0.03, z: 0.98, sequence: 7 },
          },
        },
      ],
    );

    expect(snapshot).toMatchObject({
      totalSamples: 1,
      clientCount: 1,
      topicCount: 1,
      clients: ["imu-node-1"],
      topics: ["imu.accelerometer.raw"],
    });
    expect(snapshot.rows[0]).toMatchObject({
      clientId: "imu-node-1",
      displayName: "Vest IMU",
      deviceType: "imu",
      topic: "imu.accelerometer.raw",
      sequence: 7,
      measurement: "x 0.1 / y 0 / z 1",
      payloadPreview: "x: 0.1; y: 0; z: 1; sequence: 7",
    });
  });

  it("recognizes a sensor-like topic even when the client role is custom", () => {
    const snapshot = deriveSensorDataStream(
      [
        {
          clientId: "device-42",
          role: "wearable",
          capabilities: [],
          subscriptions: [],
          outboxSize: 0,
        },
      ],
      [
        {
          receivedAt: "2026-04-26T18:42:19.000Z",
          envelope: {
            type: "publish",
            topic: "ecg.raw",
            clientId: "device-42",
            payload: { ecg: [0.01, 0.03, 0.02], unit: "mV" },
          },
        },
      ],
    );

    expect(snapshot.rows[0]).toMatchObject({
      clientId: "device-42",
      topic: "ecg.raw",
      measurement: "ecg 3 samples",
    });
  });

  it("serializes the current stream snapshot as portable JSON", () => {
    const snapshot = deriveSensorDataStream([sensorClient()], [
      hrvEvent("2026-04-26T18:42:19.000Z", { bpm: 88, rrMs: 681.8, device: "strap-1" }),
    ]);

    expect(JSON.parse(serializeSensorDataStreamJson(snapshot, now))).toMatchObject({
      exportedAt: now,
      kind: "biofeedback.sensor-data-stream",
      summary: {
        totalSamples: 1,
        clientCount: 1,
        topicCount: 1,
      },
      samples: [
        {
          clientId: "heart-rate-sensor-1",
          measurement: "88 BPM / 681.8 ms RR",
          payload: {
            bpm: 88,
            rrMs: 681.8,
            device: "strap-1",
          },
        },
      ],
    });
  });
});
