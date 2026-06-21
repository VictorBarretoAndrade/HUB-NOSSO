import { describe, expect, it } from "vitest";
import { getUnrealCommandClients, summarizePayload } from "./domain";
import type { HubClient } from "./types";

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
});
