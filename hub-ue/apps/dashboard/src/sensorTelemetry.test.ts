import { describe, expect, it } from "vitest";
import {
  deriveSensorDataStream,
  deriveSensorTelemetrySummaries,
  formatSensorAge,
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
    expect(sensorSignalLabel("poor")).toBe("Poor signal");
    expect(formatSensorAge(undefined)).toBe("--");
    expect(formatSensorAge(2400)).toBe("2s ago");
    expect(formatSensorAge(65000)).toBe("1m ago");
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
