import { describe, expect, it } from "vitest";
import {
  deriveLslSensorDetails,
  deriveManagedSensors,
  deriveSensorProviders,
  hasOfficialLslRecording,
  sensorActionAvailability,
  sensorProviderStateLabel,
  sensorProviderStateTone,
  sensorPublishTopics,
} from "./sensorManager";
import type { ExperienceRunState } from "./experienceRun";
import type { StatusResponse, StreamEvent } from "./types";

const NOW = "2026-04-26T12:00:10.000Z";

function statusResponse(): StatusResponse {
  return {
    ok: true,
    service: "biofeedback-hub",
    sessionId: "session-test",
    clientCount: 1,
    pendingAckCount: 0,
    clients: [],
    pendingAcks: [],
    sensorManager: {
      clientId: "sensor-manager",
      sensorCount: 1,
      adapterCount: 1,
      recordingCount: 0,
      sensors: [
        {
          sensorId: "sim-hrv-1",
          adapterId: "simulator",
          source: "simulator",
          displayName: "Simulated HRV Sensor",
          deviceType: "hrv",
          topics: ["hrv.raw"],
          state: "connected",
          quality: "good",
        },
      ],
    },
  };
}

function event(topic: string, payload: Record<string, unknown>, receivedAt = NOW): StreamEvent {
  return {
    receivedAt,
    envelope: {
      type: "publish",
      topic,
      clientId: "sensor-manager",
      payload,
    },
  };
}

function run(status: ExperienceRunState["status"], runId = "run-001"): ExperienceRunState {
  return {
    status,
    runId,
    startedAt: "2026-04-26T12:00:00.000Z",
    source: "dashboard",
    totalPausedMs: 0,
  };
}

describe("sensor manager derivation", () => {
  it("combines /status and sensor.preview into a connected managed sensor", () => {
    const sensors = deriveManagedSensors(
      statusResponse(),
      [
        event("sensor.preview", {
          sensorId: "sim-hrv-1",
          sample: { bpm: 72, rrMs: 833.3, quality: "good" },
        }),
      ],
      NOW,
    );

    expect(sensors).toHaveLength(1);
    expect(sensors[0]).toMatchObject({
      sensorId: "sim-hrv-1",
      state: "connected",
      previewSummary: "72 bpm / 833.3 ms RR / good",
    });
  });

  it("marks connected sensors stale when preview is old", () => {
    const sensors = deriveManagedSensors(
      statusResponse(),
      [
        event(
          "sensor.preview",
          {
            sensorId: "sim-hrv-1",
            sample: { bpm: 72 },
          },
          "2026-04-26T12:00:00.000Z",
        ),
      ],
      NOW,
    );

    expect(sensors[0].state).toBe("stale");
  });

  it("uses the rate-aware stale threshold reported by the Hub", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].freshness = { staleAfterMs: 30000 };
    const sensors = deriveManagedSensors(
      status,
      [event("sensor.preview", { sensorId: "sim-hrv-1", sample: { bpm: 72 } }, "2026-04-26T12:00:00.000Z")],
      NOW,
    );

    expect(sensors[0].state).toBe("connected");
  });

  it("leaves irregular streams under the authoritative Hub stale state", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].freshness = { staleAfterMs: null };
    const sensors = deriveManagedSensors(
      status,
      [event("sensor.preview", { sensorId: "sim-hrv-1", sample: { bpm: 72 } }, "2026-04-26T12:00:00.000Z")],
      NOW,
    );

    expect(sensors[0].state).toBe("connected");
  });

  it("marks recording sensors stale locally while keeping detach available", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].state = "recording";
    status.sensorManager!.sensors[0].attachedRunId = "run-001";
    const sensors = deriveManagedSensors(
      status,
      [event("sensor.preview", { sensorId: "sim-hrv-1", sample: { bpm: 72 } }, "2026-04-26T12:00:00.000Z")],
      NOW,
    );
    const availability = sensorActionAvailability(sensors[0], run("running"), false);

    expect(sensors[0].state).toBe("stale");
    expect(availability.detach).toBe(true);
    expect(availability.disconnect).toBe(false);
    expect(availability.attach).toBe(false);
  });

  it("does not let stale sensor.status events override newer /status state", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].state = "recording";
    status.sensorManager!.sensors[0].attachedRunId = "run-001";
    status.sensorManager!.sensors[0].lastStatusAt = "2026-04-26T12:00:09.000Z";

    const sensors = deriveManagedSensors(
      status,
      [
        event(
          "sensor.status",
          {
            sensorId: "sim-hrv-1",
            adapterId: "simulator",
            source: "simulator",
            state: "connected",
            topics: ["hrv.raw"],
          },
          "2026-04-26T12:00:05.000Z",
        ),
      ],
      NOW,
    );

    expect(sensors[0].state).toBe("recording");
    expect(sensors[0].attachedRunId).toBe("run-001");
  });

  it("preserves the latest preview when a newer status event arrives", () => {
    const sensors = deriveManagedSensors(
      statusResponse(),
      [
        event("sensor.preview", {
          sensorId: "sim-hrv-1",
          sample: { bpm: 72, rrMs: 833.3, quality: "good" },
        }, "2026-04-26T12:00:08.000Z"),
        event("sensor.status", {
          sensorId: "sim-hrv-1",
          adapterId: "simulator",
          source: "simulator",
          state: "connected",
          armedForNextRun: true,
          topics: ["hrv.raw"],
        }, "2026-04-26T12:00:09.000Z"),
      ],
      NOW,
    );

    expect(sensors[0].armedForNextRun).toBe(true);
    expect(sensors[0].previewSummary).toBe("72 bpm / 833.3 ms RR / good");
  });

  it("allows arming before a run and direct attach during an active run", () => {
    const sensors = deriveManagedSensors(
      statusResponse(),
      [event("sensor.preview", { sensorId: "sim-hrv-1", sample: { bpm: 72 } })],
      NOW,
    );

    const beforeRun = sensorActionAvailability(sensors[0], run("not_started"), false);
    const activeRun = sensorActionAvailability(sensors[0], run("running"), false);

    expect(beforeRun.arm).toBe(true);
    expect(beforeRun.attach).toBe(false);
    expect(activeRun.arm).toBe(false);
    expect(activeRun.attach).toBe(true);
  });

  it("allows a connected-but-stale sensor to be armed or attached", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].state = "stale";
    const sensor = deriveManagedSensors(status, [], NOW)[0];

    expect(sensorActionAvailability(sensor, run("not_started"), false).arm).toBe(true);
    expect(sensorActionAvailability(sensor, run("running"), false).attach).toBe(true);
  });

  it("allows an armed sensor to be disarmed before the experience", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].armedForNextRun = true;
    const sensors = deriveManagedSensors(status, [], NOW);
    const availability = sensorActionAvailability(sensors[0], run("not_started"), false);

    expect(sensors[0].state).toBe("connected");
    expect(sensors[0].armedForNextRun).toBe(true);
    expect(availability.disarm).toBe(true);
    expect(availability.arm).toBe(false);
    expect(availability.disconnect).toBe(false);
  });

  it("blocks disarm while an armed sensor is handing off to an active run", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].armedForNextRun = true;
    const sensors = deriveManagedSensors(status, [], NOW);
    const availability = sensorActionAvailability(sensors[0], run("running"), false);

    expect(availability.disarm).toBe(false);
    expect(availability.detach).toBe(false);
  });

  it("keeps detach available when cleanup failed but an attached run remains", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].state = "error";
    status.sensorManager!.sensors[0].attachedRunId = "run-001";
    const sensors = deriveManagedSensors(status, [], NOW);
    const availability = sensorActionAvailability(sensors[0], run("ended"), false);

    expect(availability.detach).toBe(true);
    expect(availability.connect).toBe(false);
    expect(availability.disconnect).toBe(false);
  });

  it("keeps V0.3 status responses compatible when providers and metadata are absent", () => {
    const status = statusResponse();

    expect(deriveSensorProviders(status)).toEqual([]);
    expect(deriveManagedSensors(status, [], NOW)[0]).toMatchObject({
      sensorId: "sim-hrv-1",
      displayName: "Simulated HRV Sensor",
      lslMetadata: undefined,
      lslSync: undefined,
    });
  });

  it("recognizes an attached LSL stream as official Hub logging", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].topics = ["lsl.raw"];
    status.sensorManager!.sensors[0].attachedRunId = "run-lsl";
    status.sensorManager!.sensors[0].state = "recording";
    status.sensorManager!.sensors[0].recordingGateOpen = true;

    expect(hasOfficialLslRecording(deriveManagedSensors(status, [], NOW))).toBe(true);
  });

  it("does not report LSL logging when an attached sensor has a closed gate", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].topics = ["lsl.raw"];
    status.sensorManager!.sensors[0].attachedRunId = "run-lsl";
    status.sensorManager!.sensors[0].state = "error";
    status.sensorManager!.sensors[0].recordingGateOpen = false;

    expect(hasOfficialLslRecording(deriveManagedSensors(status, [], NOW))).toBe(false);
  });

  it("derives provider states and counts for the Sensor Manager toolbar", () => {
    const status = statusResponse();
    status.sensorManager!.providers = [
      {
        providerId: "lsl",
        state: "ready",
        discoveredCount: 3,
        supportedCount: 2,
        unsupportedCount: 1,
        lastScanAt: NOW,
      },
      { providerId: "usb", state: "unavailable", reason: "driver missing" },
      { providerId: "serial", state: "disabled" },
      { providerId: "custom", state: "error", error: "provider failed" },
    ];

    const providers = deriveSensorProviders(status);

    expect(providers.find((provider) => provider.providerId === "lsl")).toMatchObject({
      displayName: "LSL",
      state: "ready",
      discoveredCount: 3,
      supportedCount: 2,
      unsupportedCount: 1,
    });
    expect(providers.find((provider) => provider.providerId === "usb")?.detail).toBe("driver missing");
    expect(sensorProviderStateLabel("ready")).toBe("Pronto");
    expect(sensorProviderStateLabel("unavailable")).toBe("Indisponível");
    expect(sensorProviderStateLabel("disabled")).toBe("Desativado");
    expect(sensorProviderStateLabel("error")).toBe("Erro");
    expect(sensorProviderStateTone("ready")).toBe("ok");
    expect(sensorProviderStateTone("unavailable")).toBe("warn");
    expect(sensorProviderStateTone("disabled")).toBe("muted");
    expect(sensorProviderStateTone("error")).toBe("error");
  });

  it("shows LSL stream metadata, sync state and numeric preview values", () => {
    const status = statusResponse();
    status.sensorManager!.sensors = [
      {
        sensorId: "lsl-a1b2c3d4",
        adapterId: "lsl",
        source: "lsl",
        displayName: "Fallback stream name",
        deviceType: "generic",
        topics: ["lsl.raw"],
        state: "connected",
        adapterStatus: {
          stream: {
            name: "Biofeedback Hub Test",
            type: "TestSignal",
            sourceId: "hub-test-outlet",
            host: "LAB-XR",
            channelCount: 2,
            nominalSrateHz: 10,
            channelFormat: "float32",
            channels: [
              { index: 0, label: "Signal A", unit: "a.u." },
              { index: 1, label: "Signal B", unit: "a.u." },
            ],
          },
          sync: { status: "warming-up" },
        },
      },
    ];

    const sensors = deriveManagedSensors(
      status,
      [
        event("sensor.preview", {
          sensorId: "lsl-a1b2c3d4",
          sourceTopic: "lsl.raw",
          sample: {
            values: [0.25, 0.75],
            lslTimestamp: 1234.5,
            stream: { name: "Biofeedback Hub Test", type: "TestSignal", channelCount: 2, nominalSrateHz: 10 },
            sync: { status: "corrected", timeCorrectionSec: 0.02 },
          },
        }),
      ],
      NOW,
    );
    const details = deriveLslSensorDetails(sensors[0]);

    expect(sensors[0].previewSummary).toBe("2 ch: 0.25 / 0.75");
    expect(details).toEqual({
      name: "Biofeedback Hub Test",
      type: "TestSignal",
      channels: "2",
      rate: "10 Hz",
      origin: "hub-test-outlet",
      sync: "Corrected (+20 ms)",
      format: "float32",
      channelSummary: "Signal A (a.u.) / Signal B (a.u.)",
    });
  });

  it("keeps stale correction diagnostics visible during timestamp fallback", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].source = "lsl";
    status.sensorManager!.sensors[0].topics = ["lsl.raw"];
    status.sensorManager!.sensors[0].sync = {
      status: "fallback",
      timeCorrectionSec: 0.02,
      reason: "invalid-sample",
      correctionStatus: "stale",
      correctionReason: "refresh-failed",
    };

    const details = deriveLslSensorDetails(deriveManagedSensors(status, [], NOW)[0]);

    expect(details?.sync).toBe("Fallback / correção Stale (+20 ms)");
  });

  it("collects dynamic sensor topics for sensor-like roles without high-rate LSL batches", () => {
    const status = statusResponse();
    status.sensorManager!.sensors[0].topics = ["lsl.raw", "custom.sensor.raw"];
    status.clients = [
      {
        clientId: "sensor-legacy",
        role: "sensor",
        capabilities: [],
        subscriptions: [],
        outboxSize: 0,
        metadata: { contract: "legacy.raw", topics: ["custom.sensor.raw"] },
      },
      {
        clientId: "wearable-gateway",
        role: "gateway",
        deviceType: "biometric-sensor",
        capabilities: [],
        subscriptions: [],
        outboxSize: 0,
        metadata: { topic: "wearable.raw" },
      },
      {
        clientId: "generic-wearable",
        role: "wearable",
        capabilities: [],
        subscriptions: [],
        outboxSize: 0,
        metadata: { topic: "eda.raw" },
      },
    ];

    expect(sensorPublishTopics(status)).toEqual(["custom.sensor.raw", "eda.raw", "legacy.raw", "wearable.raw"]);
  });
});
