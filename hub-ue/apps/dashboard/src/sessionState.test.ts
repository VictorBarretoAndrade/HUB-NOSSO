import { describe, expect, it } from "vitest";
import { deriveSessionState } from "./sessionState";
import type { StreamEvent } from "./types";

function event(topic: string | null, payload: Record<string, unknown>): StreamEvent {
  return {
    receivedAt: "2026-04-26T12:00:00.000Z",
    envelope: {
      type: "publish",
      clientId: "unreal-quest-sim",
      topic,
      sessionTimeMs: 4200,
      payload,
    },
  };
}

describe("session state derivation", () => {
  it("derives running from an explicit unreal.state payload", () => {
    expect(deriveSessionState([event("unreal.state", { state: "running", fps: 72 })])).toMatchObject({
      state: "running",
      sourceClientId: "unreal-quest-sim",
      fps: 72,
    });
  });

  it("derives paused from an explicit unreal.state payload", () => {
    expect(
      deriveSessionState([
        event("unreal.state", {
          state: "paused",
          fps: 0,
          lastCommandId: "cmd-1",
          reason: "dashboard",
        }),
      ]),
    ).toMatchObject({
      state: "paused",
      lastCommandId: "cmd-1",
      reason: "dashboard",
    });
  });

  it("falls back from current plugin status values", () => {
    expect(deriveSessionState([event("unreal.state", { status: "idle" })]).state).toBe("paused");
    expect(deriveSessionState([event("unreal.state", { status: "online" })]).state).toBe("running");
    expect(deriveSessionState([event("unreal.state", { status: "busy" })]).state).toBe("running");
    expect(deriveSessionState([event("unreal.state", { status: "error" })]).state).toBe("error");
  });

  it("ignores non-unreal state events", () => {
    expect(deriveSessionState([event("hrv.raw", { state: "paused" })])).toEqual({ state: "unknown" });
  });
});
