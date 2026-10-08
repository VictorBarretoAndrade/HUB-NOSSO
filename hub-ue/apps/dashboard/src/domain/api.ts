import type { HealthResponse, MessageEnvelope, StatusResponse } from "./types";
import { TOPICS } from "./topics";

export const COMMAND_TOPIC = "unreal.commands";
export const SENSOR_COMMAND_TOPIC = "sensor.commands";
export const MARKER_TOPIC = "experience.marker";
export const COMMAND_TOPICS = new Set([COMMAND_TOPIC, SENSOR_COMMAND_TOPIC]);
export const CONTROLLER_CLIENT_ID = "dashboard-controller";
export const COMMAND_TIMEOUT_MS = 5000;
const COMMAND_LATE_RESPONSE_GRACE_MS = 10000;

export type UnrealCommandAction = "pause-session" | "resume-session" | "add-marker";
export type SensorCommandAction =
  | "sensor.scan"
  | "sensor.connect"
  | "sensor.disconnect"
  | "sensor.session.arm"
  | "sensor.session.disarm"
  | "sensor.session.attach"
  | "sensor.session.detach";
export type CommandStatus = "pending" | "accepted" | "rejected" | "timeout" | "failed";

export interface BuildUnrealCommandOptions {
  action: UnrealCommandAction;
  arguments?: Record<string, unknown>;
  clientId?: string;
}

export interface BuildSensorCommandOptions {
  action: SensorCommandAction;
  arguments?: Record<string, unknown>;
  clientId?: string;
}

export interface CommandDispatchResult {
  command: MessageEnvelope;
  ack: MessageEnvelope | null;
  status: Exclude<CommandStatus, "pending">;
  detail?: string;
}

export type LateCommandResponseHandler = (result: CommandDispatchResult) => void;

export const DEFAULT_HUB_ENDPOINT = "http://127.0.0.1:8787";

export type EndpointValidation = { ok: true; endpoint: string } | { ok: false; message: string };

export function normalizeHttpEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_HUB_ENDPOINT;
}

/**
 * Valida o endereço do hub antes de aplicá-lo: um endpoint inválido derrubaria a
 * montagem da URL do WebSocket, então o erro é devolvido como mensagem para o formulário.
 */
export function validateHubEndpoint(value: string): EndpointValidation {
  const endpoint = normalizeHttpEndpoint(value);
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, message: "Endereço inválido. Use o formato http://host:porta, por exemplo http://127.0.0.1:8787." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "O endereço deve começar com http:// ou https://." };
  }
  return { ok: true, endpoint };
}

/** Traduz falhas de rede/HTTP em uma mensagem que diz ao operador o que verificar. */
export function describeHubError(error: unknown, endpoint: string): string {
  if (error instanceof TypeError) {
    return `Não foi possível conectar ao hub em ${endpoint}. Verifique se o hub está em execução e se o endereço está correto.`;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return `Não foi possível conectar ao hub em ${endpoint}.`;
}

export function toWebSocketEndpoint(httpEndpoint: string, token: string): string {
  const url = new URL("/ws", normalizeHttpEndpoint(httpEndpoint));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (token.trim()) {
    url.searchParams.set("token", token.trim());
  }
  return url.toString();
}

export async function fetchHealth(endpoint: string): Promise<HealthResponse> {
  const response = await fetch(`${normalizeHttpEndpoint(endpoint)}/health`);
  if (!response.ok) {
    throw new Error(`O hub respondeu HTTP ${response.status} em /health.`);
  }
  return (await response.json()) as HealthResponse;
}

export async function fetchStatus(endpoint: string): Promise<StatusResponse> {
  const response = await fetch(`${normalizeHttpEndpoint(endpoint)}/status`);
  if (!response.ok) {
    throw new Error(`O hub respondeu HTTP ${response.status} em /status.`);
  }
  return (await response.json()) as StatusResponse;
}

export function buildHello(clientId = "dashboard-ui"): MessageEnvelope {
  return {
    type: "hello",
    clientId,
    payload: {
      clientId,
      role: "dashboard",
      capabilities: ["monitoring"],
    },
  };
}

export function buildControllerHello(clientId = CONTROLLER_CLIENT_ID): MessageEnvelope {
  return {
    type: "hello",
    clientId,
    payload: {
      clientId,
      role: "controller",
      capabilities: ["commands"],
    },
  };
}

export function buildMonitorSubscribe(clientId = "dashboard-ui"): MessageEnvelope {
  return {
    type: "subscribe",
    clientId,
    payload: {
      topics: TOPICS.filter((topic) => !COMMAND_TOPICS.has(topic)),
    },
  };
}

export function buildSubscribe(clientId = "dashboard-ui"): MessageEnvelope {
  return buildMonitorSubscribe(clientId);
}

export function buildUnrealCommand(options: BuildUnrealCommandOptions): MessageEnvelope {
  const clientId = options.clientId ?? CONTROLLER_CLIENT_ID;
  return {
    version: 1,
    id: createMessageId(),
    type: "publish",
    clientId,
    topic: COMMAND_TOPIC,
    requiresAck: true,
    payload: {
      action: options.action,
      target: "all",
      arguments: options.arguments ?? { reason: "dashboard" },
    },
  };
}

export function buildSensorCommand(options: BuildSensorCommandOptions): MessageEnvelope {
  const clientId = options.clientId ?? CONTROLLER_CLIENT_ID;
  return {
    version: 1,
    id: createMessageId(),
    type: "publish",
    clientId,
    topic: SENSOR_COMMAND_TOPIC,
    requiresAck: true,
    payload: {
      action: options.action,
      target: options.action === "sensor.scan" ? "all" : "single",
      arguments: options.arguments ?? { reason: "dashboard" },
    },
  };
}

export interface MarkerDraft {
  markerId: string;
  label: string;
  note: string;
}

export function createMarkerId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `marker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Argumentos do comando add-marker enviado ao Unreal (que republica em experience.marker). */
export function buildMarkerArguments(marker: MarkerDraft): Record<string, unknown> {
  const note = marker.note.trim();
  return {
    reason: "dashboard",
    markerId: marker.markerId,
    label: marker.label.trim(),
    ...(note ? { note } : {}),
  };
}

/**
 * Marker publicado direto em experience.marker pelo dashboard. Usado quando não há
 * cliente inscrito em unreal.commands: a anotação entra na timeline mesmo sem Unreal.
 */
export function buildMarkerAnnotation(marker: MarkerDraft, runId?: string | null, clientId = "dashboard-ui"): MessageEnvelope {
  const note = marker.note.trim();
  return {
    version: 1,
    id: createMessageId(),
    type: "publish",
    clientId,
    topic: MARKER_TOPIC,
    requiresAck: false,
    payload: {
      markerId: marker.markerId,
      label: marker.label.trim(),
      ...(note ? { note } : {}),
      ...(runId ? { runId } : {}),
      source: "dashboard",
      reason: "ui",
    },
  };
}

export function isAckForCommand(ack: MessageEnvelope, command: MessageEnvelope): boolean {
  return (
    ack.type === "ack" &&
    Boolean(command.id) &&
    (ack.correlationId === command.id || ack.payload?.messageId === command.id)
  );
}

export function commandStatusFromAck(ack: MessageEnvelope): "accepted" | "rejected" | "failed" {
  const status = ack.payload?.status;
  if (status === "accepted" || status === "rejected") {
    return status;
  }
  return "failed";
}

export function publishUnrealCommand(
  endpoint: string,
  token: string,
  command: MessageEnvelope,
  timeoutMs = COMMAND_TIMEOUT_MS,
  onLateResponse?: LateCommandResponseHandler,
): Promise<CommandDispatchResult> {
  return publishCommand(endpoint, token, command, timeoutMs, onLateResponse);
}

export function publishSensorCommand(
  endpoint: string,
  token: string,
  command: MessageEnvelope,
  timeoutMs = COMMAND_TIMEOUT_MS,
  onLateResponse?: LateCommandResponseHandler,
): Promise<CommandDispatchResult> {
  return publishCommand(endpoint, token, command, timeoutMs, onLateResponse);
}

export function publishCommand(
  endpoint: string,
  token: string,
  command: MessageEnvelope,
  timeoutMs = COMMAND_TIMEOUT_MS,
  onLateResponse?: LateCommandResponseHandler,
): Promise<CommandDispatchResult> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    let settled = false;
    let awaitingLateResponse = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let lateResponseTimeout: ReturnType<typeof setTimeout> | null = null;

    const closeSocket = () => {
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close();
      }
    };

    const finish = (result: CommandDispatchResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      closeSocket();
      resolve(result);
    };

    const finishAfterTimeout = () => {
      if (settled) {
        return;
      }
      settled = true;
      timeout = null;
      awaitingLateResponse = true;
      resolve({
        command,
        ack: null,
        status: "timeout",
        detail: `Nenhum ACK recebido em ${Math.round(timeoutMs / 1000)} s. Aguardando brevemente uma resposta tardia.`,
      });
      lateResponseTimeout = setTimeout(() => {
        awaitingLateResponse = false;
        closeSocket();
      }, COMMAND_LATE_RESPONSE_GRACE_MS);
    };

    const finishLateResponse = (result: CommandDispatchResult) => {
      if (!awaitingLateResponse) {
        return;
      }
      awaitingLateResponse = false;
      if (lateResponseTimeout) {
        clearTimeout(lateResponseTimeout);
        lateResponseTimeout = null;
      }
      closeSocket();
      onLateResponse?.(result);
    };

    try {
      socket = new WebSocket(toWebSocketEndpoint(endpoint, token));
    } catch (error) {
      resolve({
        command,
        ack: null,
        status: "failed",
        detail: error instanceof Error ? error.message : "Não foi possível abrir o socket de comando.",
      });
      return;
    }

    timeout = setTimeout(finishAfterTimeout, timeoutMs);

    socket.onopen = () => {
      socket.send(JSON.stringify(buildControllerHello(command.clientId)));
      socket.send(JSON.stringify(command));
    };

    socket.onmessage = (message) => {
      try {
        const envelope = JSON.parse(String(message.data)) as MessageEnvelope;
        if (isAckForCommand(envelope, command)) {
          const result = {
            command,
            ack: envelope,
            status: commandStatusFromAck(envelope),
            detail: readAckDetail(envelope),
          } satisfies CommandDispatchResult;
          if (awaitingLateResponse) {
            finishLateResponse(result);
          } else {
            finish(result);
          }
        } else if (envelope.type === "error" && (!settled || isErrorForCommand(envelope, command))) {
          const result = {
            command,
            ack: envelope,
            status: "failed",
            detail: readErrorMessage(envelope),
          } satisfies CommandDispatchResult;
          if (awaitingLateResponse) {
            finishLateResponse(result);
          } else {
            finish(result);
          }
        }
      } catch {
        if (!settled) {
          finish({
            command,
            ack: null,
            status: "failed",
            detail: "O hub enviou uma resposta de comando ilegível.",
          });
        }
      }
    };

    socket.onerror = () => {
      if (!settled) {
        finish({
          command,
          ack: null,
          status: "failed",
          detail: "Falha no WebSocket de comando.",
        });
      }
    };

    socket.onclose = () => {
      if (!settled) {
        finish({
          command,
          ack: null,
          status: "failed",
          detail: "O socket de comando fechou antes do ACK.",
        });
      } else {
        awaitingLateResponse = false;
      }
    };
  });
}

function createMessageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `dashboard-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readAckDetail(ack: MessageEnvelope): string | undefined {
  const detail = ack.payload?.detail;
  return typeof detail === "string" && detail.trim() ? detail : undefined;
}

function readErrorMessage(envelope: MessageEnvelope): string {
  const message = envelope.payload?.message;
  return typeof message === "string" && message.trim() ? message : "O hub retornou um erro.";
}

function isErrorForCommand(envelope: MessageEnvelope, command: MessageEnvelope): boolean {
  return (
    envelope.type === "error" &&
    Boolean(command.id) &&
    (envelope.correlationId === command.id || envelope.payload?.messageId === command.id)
  );
}
