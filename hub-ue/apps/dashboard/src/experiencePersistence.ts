import type { CommandHistoryItem } from "./commandHistory";
import type { ExperienceRunState } from "./experienceRun";
import type { StreamEvent } from "./types";

export const EXPERIENCE_STORAGE_KEY = "biofeedback-dashboard.experience.v1";
export const EXPERIENCE_EVENT_LIMIT = 5000;
const PERSISTENCE_VERSION = 1;
const EXPERIENCE_TOPICS = new Set(["experience.lifecycle", "experience.marker", "unreal.state", "hrv.raw"]);

export interface PersistedExperienceSession {
  version: 1;
  savedAt: string;
  experienceRun: ExperienceRunState;
  experienceEvents: StreamEvent[];
  commandHistory: CommandHistoryItem[];
}

export interface ExperienceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function buildPersistedExperienceSession(
  experienceRun: ExperienceRunState,
  experienceEvents: StreamEvent[],
  commandHistory: CommandHistoryItem[],
  savedAt = new Date().toISOString(),
): PersistedExperienceSession {
  return {
    version: PERSISTENCE_VERSION,
    savedAt,
    experienceRun,
    experienceEvents: sanitizeExperienceEvents(experienceEvents),
    commandHistory,
  };
}

export function saveExperienceSession(storage: ExperienceStorage, session: PersistedExperienceSession): void {
  storage.setItem(EXPERIENCE_STORAGE_KEY, JSON.stringify(session));
}

export function loadExperienceSession(storage: ExperienceStorage): PersistedExperienceSession | null {
  const raw = storage.getItem(EXPERIENCE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedExperienceSession>;
    if (
      parsed.version !== PERSISTENCE_VERSION ||
      typeof parsed.savedAt !== "string" ||
      !isExperienceRunState(parsed.experienceRun) ||
      !Array.isArray(parsed.experienceEvents) ||
      !Array.isArray(parsed.commandHistory)
    ) {
      return null;
    }
    return {
      version: PERSISTENCE_VERSION,
      savedAt: parsed.savedAt,
      experienceRun: parsed.experienceRun,
      experienceEvents: sanitizeExperienceEvents(parsed.experienceEvents),
      commandHistory: parsed.commandHistory.filter(isCommandHistoryItem),
    };
  } catch {
    return null;
  }
}

export function clearExperienceSession(storage: ExperienceStorage): void {
  storage.removeItem(EXPERIENCE_STORAGE_KEY);
}

export function appendExperienceEvent(events: StreamEvent[], event: StreamEvent, limit = EXPERIENCE_EVENT_LIMIT): StreamEvent[] {
  const sanitized = sanitizeExperienceEvent(event);
  if (!sanitized) {
    return events;
  }
  return [sanitized, ...events].slice(0, limit);
}

export function sanitizeExperienceEvents(events: StreamEvent[], limit = EXPERIENCE_EVENT_LIMIT): StreamEvent[] {
  return events
    .map(sanitizeExperienceEvent)
    .filter((event): event is StreamEvent => event !== null)
    .slice(0, limit);
}

export function sanitizeExperienceEvent(event: StreamEvent): StreamEvent | null {
  const topic = event.envelope.topic;
  if (!topic || !EXPERIENCE_TOPICS.has(topic)) {
    return null;
  }

  return {
    ...event,
    envelope: {
      ...event.envelope,
      payload: topic === "hrv.raw" ? sanitizeHrvPayload(event.envelope.payload ?? {}) : event.envelope.payload,
    },
  };
}

function sanitizeHrvPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  copyNumber(payload, sanitized, "bpm");
  copyNumber(payload, sanitized, "rrMs");
  copyNumber(payload, sanitized, "hrStatus");
  copyNumber(payload, sanitized, "sequence");
  copyString(payload, sanitized, "source");
  copyString(payload, sanitized, "device");

  const restoredCount = readNumber(payload.ibiSampleCount);
  const ibiSampleCount = typeof restoredCount === "number" ? restoredCount : Array.isArray(payload.ibiMs) ? payload.ibiMs.length : undefined;
  if (typeof ibiSampleCount === "number") {
    sanitized.ibiSampleCount = ibiSampleCount;
  }
  return sanitized;
}

function isExperienceRunState(value: unknown): value is ExperienceRunState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (record.status === "not_started" || record.status === "running" || record.status === "paused" || record.status === "ended") &&
    typeof record.totalPausedMs === "number"
  );
}

function isCommandHistoryItem(value: unknown): value is CommandHistoryItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.messageId === "string" && typeof record.action === "string" && typeof record.sentAt === "string";
}

function copyNumber(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  const value = readNumber(source[key]);
  if (typeof value === "number") {
    target[key] = value;
  }
}

function copyString(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
  const value = source[key];
  if (typeof value === "string" && value.trim()) {
    target[key] = value;
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
