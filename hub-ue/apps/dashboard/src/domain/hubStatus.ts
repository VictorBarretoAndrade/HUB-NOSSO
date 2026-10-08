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

export function hasManagedSensors(status: StatusResponse | null): boolean {
  return (status?.sensorManager?.sensorCount ?? 0) > 0;
}

export function deriveReadiness(health: HealthResponse | null, status: StatusResponse | null): ReadinessItem[] {
  const clients = status?.clients ?? [];
  const unrealClients = getUnrealClients(clients);
  const sensorClients = getSensorClients(clients);
  const sensorReady = sensorClients.length > 0 || hasManagedSensors(status);
  const pendingAckCount = status?.pendingAckCount ?? health?.pendingAcks ?? 0;
  const loggerCount = clients.filter((client) => client.role === "logger").length;

  return [
    {
      label: "Hub",
      state: health?.ok ? "Pronto" : "Offline",
      tone: health?.ok ? "ready" : "danger",
    },
    {
      label: "Unreal / Quest",
      state: unrealClients.length > 0 ? "Conectado" : "Ausente",
      tone: unrealClients.length > 0 ? "ready" : "warn",
    },
    {
      label: "Sensores",
      state: sensorReady ? "Ativos" : "Aguardando",
      tone: sensorReady ? "ready" : "warn",
    },
    {
      label: "ACKs",
      state: pendingAckLabel(pendingAckCount),
      tone: pendingAckCount > 0 ? "warn" : "ready",
    },
    {
      label: "Logs",
      state: loggerCount > 0 ? "Transmitindo" : "Local",
      tone: loggerCount > 0 ? "ready" : "idle",
    },
  ];
}

function pendingAckLabel(count: number): string {
  if (count === 0) return "Sem pendências";
  return count === 1 ? "1 pendente" : `${count} pendentes`;
}

export function requiredActions(health: HealthResponse | null, status: StatusResponse | null): string[] {
  if (!health) {
    return ["Inicie o hub com .\\.venv\\Scripts\\biofeedback-hub", "Confira o endereço do hub em Diagnóstico"];
  }
  const clients = status?.clients ?? [];
  const actions: string[] = [];
  if (getUnrealClients(clients).length === 0) {
    actions.push("Conecte um cliente Unreal / Quest inscrito em unreal.commands");
  }
  if (getSensorClients(clients).length === 0 && !hasManagedSensors(status)) {
    actions.push("Inicie um adaptador de sensor ou simulador para hrv.raw / eeg.raw");
  }
  if ((status?.pendingAckCount ?? 0) > 0) {
    actions.push("Verifique os ACKs pendentes antes de enviar novos comandos críticos");
  }
  if (actions.length === 0) {
    actions.push("Tudo pronto: acompanhe os tópicos ao vivo durante a sessão");
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
