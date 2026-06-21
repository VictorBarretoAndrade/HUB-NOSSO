import { describe, expect, it } from "vitest";
import type { CommandHistoryItem } from "./commandHistory";
import { startExperienceRun } from "./experienceRun";
import {
  EXPERIENCE_STORAGE_KEY,
  appendExperienceEvent,
  buildPersistedExperienceSession,
  clearExperienceSession,
  loadExperienceSession,
  saveExperienceSession,
  sanitizeExperienceEvent,
} from "./experiencePersistence";
import type { StreamEvent } from "./types";

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

function event(topic: string | null, payload: Record<string, unknown>, receivedAt = "2026-04-26T12:00:01.000Z"): StreamEvent {
  return {
    receivedAt,
    envelope: {
      type: "publish",
      topic,
      clientId: topic === "hrv.raw" ? "heart-rate-sensor-1" : "unreal-quest-host",
      sessionTimeMs: 1000,
      payload,
    },
  };
}

function commandHistory(): CommandHistoryItem[] {
  return [
    {
      messageId: "cmd-1",
      action: "add-marker",
      target: "all",
      sentAt: "2026-04-26T12:00:03.000Z",
      status: "accepted",
      completedAt: "2026-04-26T12:00:04.000Z",
      durationMs: 1000,
      markerId: "marker-1",
      markerLabel: "stimulus-start",
    },
  ];
}

describe("experience persistence", () => {
  it("saves and restores a local experience session", () => {
    const storage = new MemoryStorage();
    const run = startExperienceRun("2026-04-26T12:00:00.000Z");
    const session = buildPersistedExperienceSession(
      run,
      [event("experience.marker", { markerId: "marker-1", label: "stimulus-start" })],
      commandHistory(),
      "2026-04-26T12:00:05.000Z",
    );

    saveExperienceSession(storage, session);

    expect(loadExperienceSession(storage)).toEqual(session);
  });

  it("sanitizes hrv.raw before saving and ignores irrelevant topics", () => {
    const hrv = sanitizeExperienceEvent(
      event("hrv.raw", {
        bpm: 84.2,
        rrMs: 714.29,
        ibiMs: [714, 720],
        hrStatus: 1,
        sequence: 10,
        source: "generic-heart-rate-websocket",
        device: "heart-rate-sensor-1",
        extra: "drop-me",
      }),
    );

    expect(hrv?.envelope.payload).toEqual({
      bpm: 84.2,
      rrMs: 714.29,
      hrStatus: 1,
      sequence: 10,
      source: "generic-heart-rate-websocket",
      device: "heart-rate-sensor-1",
      ibiSampleCount: 2,
    });
    expect(hrv?.envelope.payload?.ibiMs).toBeUndefined();
    expect(sanitizeExperienceEvent(event("logger.events", { message: "ignore" }))).toBeNull();
  });

  it("appends relevant events newest-first with a fixed limit", () => {
    const first = event("experience.marker", { markerId: "m1", label: "first" }, "2026-04-26T12:00:01.000Z");
    const second = event("unreal.state", { state: "running" }, "2026-04-26T12:00:02.000Z");
    const ignored = event("logger.events", { message: "ignore" }, "2026-04-26T12:00:03.000Z");

    expect(appendExperienceEvent([first], second, 2).map((item) => item.receivedAt)).toEqual([
      "2026-04-26T12:00:02.000Z",
      "2026-04-26T12:00:01.000Z",
    ]);
    expect(appendExperienceEvent([first, second], ignored, 2)).toEqual([first, second]);
  });

  it("persists experience.lifecycle events", () => {
    const lifecycle = event(
      "experience.lifecycle",
      { event: "started", runId: "run-1", label: "block A", source: "xr" },
      "2026-04-26T12:00:01.000Z",
    );

    expect(sanitizeExperienceEvent(lifecycle)).toEqual(lifecycle);
  });

  it("ignores invalid or unsupported persisted payloads", () => {
    const storage = new MemoryStorage();

    storage.setItem(EXPERIENCE_STORAGE_KEY, "{not-json");
    expect(loadExperienceSession(storage)).toBeNull();

    storage.setItem(
      EXPERIENCE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        savedAt: "2026-04-26T12:00:05.000Z",
        experienceRun: startExperienceRun("2026-04-26T12:00:00.000Z"),
        experienceEvents: [],
        commandHistory: [],
      }),
    );
    expect(loadExperienceSession(storage)).toBeNull();
  });

  it("clears the persisted local experience session", () => {
    const storage = new MemoryStorage();
    const session = buildPersistedExperienceSession(
      startExperienceRun("2026-04-26T12:00:00.000Z"),
      [],
      [],
      "2026-04-26T12:00:05.000Z",
    );

    saveExperienceSession(storage, session);
    clearExperienceSession(storage);

    expect(storage.getItem(EXPERIENCE_STORAGE_KEY)).toBeNull();
  });
});
