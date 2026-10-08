import { describe, expect, it } from "vitest";
import { deriveReadiness, getUnrealCommandClients, requiredActions, summarizePayload } from "./hubStatus";
import type { HealthResponse, HubClient, StatusResponse } from "./types";

describe("session control readiness", () => {
  it("finds clients subscribed to unreal.commands", () => {
    const clients: HubClient[] = [
      {
        clientId: "dashboard-ui",
        role: "dashboard",
        capabilities: ["monitoring"],
        subscriptions: ["unreal.state"],
        outboxSize: 0,
      },
      {
        clientId: "unreal-quest-sim",
        role: "unreal",
        capabilities: ["simulated-unreal"],
        subscriptions: ["unreal.commands"],
        outboxSize: 0,
      },
    ];

    expect(getUnrealCommandClients(clients).map((client) => client.clientId)).toEqual(["unreal-quest-sim"]);
  });

  it("summarizes hrv payloads without exposing long raw arrays", () => {
    expect(
      summarizePayload({
        bpm: 96.6,
        rrMs: 618.56,
        ibiMs: [610, 621, 640],
        hrStatus: 1,
      }),
    ).toBe("bpm 97; rr 618.6ms; ibi 3; status 1");
  });

  it("treats managed sensors as active sensor readiness", () => {
    const health: HealthResponse = {
      ok: true,
      service: "biofeedback-hub",
      sessionId: "session-test",
      pendingAcks: 0,
    };
    const status: StatusResponse = {
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
            topics: ["hrv.raw"],
            state: "available",
          },
        ],
      },
    };

    expect(deriveReadiness(health, status).find((item) => item.label === "Sensores")).toMatchObject({
      state: "Ativos",
      tone: "ready",
    });
    expect(requiredActions(health, status)).not.toContain("Start a sensor adapter or simulator for hrv.raw / eeg.raw");
  });
});
