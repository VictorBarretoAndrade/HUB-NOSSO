import type { HealthResponse, MessageEnvelope, StatusResponse } from "./types";
import { TOPICS } from "./topics";

export const COMMAND_TOPIC = "unreal.commands";
export const CONTROLLER_CLIENT_ID = "dashboard-controller";
export const COMMAND_TIMEOUT_MS = 5000;

export type UnrealCommandAction = "pause-session" | "resume-session" | "add-marker";
export type CommandStatus = "pending" | "accepted" | "rejected" | "timeout" | "failed";

export interface BuildUnrealCommandOptions {
  action: UnrealCommandAction;
  arguments?: Record<string, unknown>;
  clientId?: string;
}

export interface CommandDispatchResult {
  command: MessageEnvelope;
  ack: MessageEnvelope | null;
  status: Exclude<CommandStatus, "pending">;
  detail?: string;
}

export function normalizeHttpEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || "http://127.0.0.1:8787";
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
    throw new Error(`Health request failed with HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export async function fetchStatus(endpoint: string): Promise<StatusResponse> {
  const response = await fetch(`${normalizeHttpEndpoint(endpoint)}/status`);
  if (!response.ok) {
    throw new Error(`Status request failed with HTTP ${response.status}`);
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
      topics: TOPICS.filter((topic) => topic !== COMMAND_TOPIC),
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
): Promise<CommandDispatchResult> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: CommandDispatchResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close();
      }
      resolve(result);
    };

    try {
      socket = new WebSocket(toWebSocketEndpoint(endpoint, token));
    } catch (error) {
      resolve({
        command,
        ack: null,
        status: "failed",
        detail: error instanceof Error ? error.message : "Unable to open command socket",
      });
      return;
    }

    timeout = setTimeout(() => {
      finish({
        command,
        ack: null,
        status: "timeout",
        detail: `No ACK received within ${Math.round(timeoutMs / 1000)}s.`,
      });
    }, timeoutMs);

    socket.onopen = () => {
      socket.send(JSON.stringify(buildControllerHello(command.clientId)));
      socket.send(JSON.stringify(command));
    };

    socket.onmessage = (message) => {
      try {
        const envelope = JSON.parse(String(message.data)) as MessageEnvelope;
        if (isAckForCommand(envelope, command)) {
          finish({
            command,
            ack: envelope,
            status: commandStatusFromAck(envelope),
            detail: readAckDetail(envelope),
          });
        } else if (envelope.type === "error") {
          finish({
            command,
            ack: envelope,
            status: "failed",
            detail: readErrorMessage(envelope),
          });
        }
      } catch {
        finish({
          command,
          ack: null,
          status: "failed",
          detail: "Received an unreadable command response",
        });
      }
    };

    socket.onerror = () => {
      finish({
        command,
        ack: null,
        status: "failed",
        detail: "Command WebSocket failed",
      });
    };

    socket.onclose = () => {
      if (!settled) {
        finish({
          command,
          ack: null,
          status: "failed",
          detail: "Command socket closed before ACK",
        });
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
  return typeof message === "string" && message.trim() ? message : "Hub returned an error";
}
