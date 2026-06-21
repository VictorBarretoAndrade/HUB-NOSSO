import type { HealthResponse, HubClient, PendingAck, StatusResponse, StreamEvent } from "./types";

const UNREAL_COMMANDS_TOPIC = "unreal.commands";

export type ReadinessTone = "ready" | "warn" | "danger" | "idle";

export interface ReadinessItem {
  label: string;
  state: string;
  tone: ReadinessTone;
}

export function getUnrealClients(clients: HubClient[]): HubClient[] {
  return clients.filter((client) => client.role === "unreal");
}

export function getUnrealCommandClients(clients: HubClient[]): HubClient[] {
  return clients.filter((client) => client.subscriptions.includes(UNREAL_COMMANDS_TOPIC));
}

export function getSensorClients(clients: HubClient[]): HubClient[] {
  return clients.filter((client) => client.role === "sensor");
}

export function deriveReadiness(health: HealthResponse | null, status: StatusResponse | null): ReadinessItem[] {
  const clients = status?.clients ?? [];
  const unrealClients = getUnrealClients(clients);
  const sensorClients = getSensorClients(clients);
  const pendingAckCount = status?.pendingAckCount ?? health?.pendingAcks ?? 0;
  const loggerCount = clients.filter((client) => client.role === "logger").length;

  return [
    {
      label: "Hub",
      state: health?.ok ? "Ready" : "Offline",
      tone: health?.ok ? "ready" : "danger",
    },
    {
      label: "Unreal / Quest",
      state: unrealClients.length > 0 ? "Connected" : "Missing",
      tone: unrealClients.length > 0 ? "ready" : "warn",
    },
    {
      label: "Sensors",
      state: sensorClients.length > 0 ? "Active" : "Waiting",
      tone: sensorClients.length > 0 ? "ready" : "warn",
    },
    {
      label: "ACKs",
      state: pendingAckCount > 0 ? `${pendingAckCount} pending` : "No pending",
      tone: pendingAckCount > 0 ? "warn" : "ready",
    },
    {
      label: "Logs",
      state: loggerCount > 0 ? "Streaming" : "Local",
      tone: loggerCount > 0 ? "ready" : "idle",
    },
  ];
}

export function requiredActions(health: HealthResponse | null, status: StatusResponse | null): string[] {
  if (!health) {
    return ["Start the hub with .\\.venv\\Scripts\\biofeedback-hub", "Verify http://127.0.0.1:8787/health"];
  }
  const clients = status?.clients ?? [];
  const actions: string[] = [];
  if (getUnrealClients(clients).length === 0) {
    actions.push("Connect an Unreal / Quest client subscribed to unreal.commands");
  }
  if (getSensorClients(clients).length === 0) {
    actions.push("Start a sensor adapter or simulator for hrv.raw / eeg.raw");
  }
  if ((status?.pendingAckCount ?? 0) > 0) {
    actions.push("Inspect pending ACKs before dispatching new critical commands");
  }
  if (actions.length === 0) {
    actions.push("Monitor live topics and keep diagnostics visible during the session");
  }
  return actions;
}

export function activeTopicCount(status: StatusResponse | null): number {
  const topics = new Set<string>();
  for (const client of status?.clients ?? []) {
    for (const topic of client.subscriptions) {
      topics.add(topic);
    }
  }
  return topics.size;
}

export function summarizePayload(payload: Record<string, unknown> | undefined): string {
  if (!payload || Object.keys(payload).length === 0) {
    return "{}";
  }
  const action = payload.action;
  if (typeof action === "string") {
    return action;
  }
  const bpm = readNumber(payload.bpm);
  const rrMs = readNumber(payload.rrMs);
  const hrStatus = readNumber(payload.hrStatus);
  if (typeof bpm === "number" || typeof rrMs === "number" || Array.isArray(payload.ibiMs)) {
    const parts: string[] = [];
    if (typeof bpm === "number") {
      parts.push(`bpm ${Math.round(bpm)}`);
    }
    if (typeof rrMs === "number") {
      parts.push(`rr ${roundOneDecimal(rrMs)}ms`);
    }
    if (Array.isArray(payload.ibiMs)) {
      parts.push(`ibi ${payload.ibiMs.length}`);
    }
    if (typeof hrStatus === "number") {
      parts.push(`status ${hrStatus}`);
    }
    return parts.join("; ");
  }
  return JSON.stringify(payload);
}

export function eventSeverity(event: StreamEvent): "ok" | "warn" | "error" {
  if (event.envelope.type === "error") {
    return "error";
  }
  if (event.envelope.type === "ack" || event.envelope.requiresAck) {
    return "warn";
  }
  return "ok";
}

export function latestPendingAck(pendingAcks: PendingAck[]): PendingAck | null {
  return pendingAcks[0] ?? null;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
