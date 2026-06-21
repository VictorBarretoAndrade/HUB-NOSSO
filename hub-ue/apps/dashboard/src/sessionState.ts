import type { StreamEvent } from "./types";

export type ObservedSessionState = "unknown" | "running" | "paused" | "error";

export interface SessionStateSummary {
  state: ObservedSessionState;
  sourceClientId?: string;
  receivedAt?: string;
  sessionTimeMs?: number | null;
  fps?: number;
  status?: string;
  lastCommandId?: string;
  reason?: string;
}

const UNREAL_STATE_TOPIC = "unreal.state";

export function deriveSessionState(events: StreamEvent[]): SessionStateSummary {
  const event = events.find((item) => item.envelope.topic === UNREAL_STATE_TOPIC);
  if (!event) {
    return { state: "unknown" };
  }

  const payload = event.envelope.payload ?? {};
  const status = readString(payload.status);
  const state = normalizeState(readString(payload.state)) ?? stateFromStatus(status) ?? "unknown";

  return {
    state,
    sourceClientId: event.envelope.clientId,
    receivedAt: event.receivedAt,
    sessionTimeMs: event.envelope.sessionTimeMs ?? null,
    fps: readNumber(payload.fps) ?? readNestedNumber(payload.telemetry, "fps"),
    status,
    lastCommandId: readString(payload.lastCommandId),
    reason: readString(payload.reason),
  };
}

export function sessionStateTone(state: ObservedSessionState): "ok" | "warn" | "error" | "muted" {
  if (state === "running") return "ok";
  if (state === "paused") return "warn";
  if (state === "error") return "error";
  return "muted";
}

export function sessionStateLabel(state: ObservedSessionState): string {
  if (state === "unknown") return "Unknown";
  return `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
}

function normalizeState(value: string | undefined): ObservedSessionState | null {
  const normalized = value?.toLowerCase();
  if (normalized === "running" || normalized === "paused" || normalized === "error") {
    return normalized;
  }
  return null;
}

function stateFromStatus(value: string | undefined): ObservedSessionState | null {
  const normalized = value?.toLowerCase();
  if (normalized === "idle") return "paused";
  if (normalized === "online" || normalized === "busy") return "running";
  if (normalized === "error") return "error";
  return null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNestedNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return readNumber((value as Record<string, unknown>)[key]);
}
