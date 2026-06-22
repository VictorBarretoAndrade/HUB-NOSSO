import { describe, expect, it } from "vitest";
import {
  buildCaptureLifecyclePayload,
  createDefaultCaptureProfile,
  isCaptureValid,
  loadCaptureProfile,
  saveCaptureProfile,
  toggleSignal,
} from "./captureProfile";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe("captureProfile", () => {
  it("defaults to stream-only with no sensors", () => {
    const profile = createDefaultCaptureProfile();
    expect(profile.mode).toBe("stream");
    expect(profile.sensors).toEqual([]);
    expect(isCaptureValid(profile)).toBe(true);
  });

  it("adds and removes a signal for a sensor", () => {
    let profile = createDefaultCaptureProfile();
    profile = toggleSignal(profile, "polar-h10", "ecg");
    expect(profile.sensors).toEqual([{ clientId: "polar-h10", signals: ["ecg"] }]);
    profile = toggleSignal(profile, "polar-h10", "ecg");
    expect(profile.sensors).toEqual([]);
  });

  it("requires a selected sensor when recording", () => {
    const recording = { ...createDefaultCaptureProfile(), mode: "record" as const };
    expect(isCaptureValid(recording)).toBe(false);
    expect(isCaptureValid(toggleSignal(recording, "polar-h10", "rr"))).toBe(true);
  });

  it("embeds capture and subject in the lifecycle payload", () => {
    const payload = buildCaptureLifecyclePayload({
      event: "started",
      runId: "run-1",
      capture: toggleSignal(createDefaultCaptureProfile(), "polar-h10", "ecg"),
    });
    expect(payload.event).toBe("started");
    expect((payload.capture as { sensors: unknown[] }).sensors).toHaveLength(1);
    expect(payload.subject).toBeUndefined();
  });

  it("round-trips through storage", () => {
    const storage = new MemoryStorage();
    const profile = toggleSignal({ ...createDefaultCaptureProfile(), mode: "record" as const }, "polar-h10", "ecg");
    saveCaptureProfile(storage, profile);
    expect(loadCaptureProfile(storage)).toEqual(profile);
    expect(loadCaptureProfile(new MemoryStorage())).toBeNull();
  });
});
