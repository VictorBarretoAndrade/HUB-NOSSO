import { COMMAND_TOPIC } from "./api";
import type { CommandStatus } from "./api";
import type { SessionStateSummary } from "./sessionState";
import type { HubClient, MessageEnvelope, StreamEvent } from "./types";

export interface CommandHistoryItem {
  messageId: string;
  action: string;
  target: string;
  runId?: string;
  sentAt: string;
  status: CommandStatus;
  completedAt?: string;
  durationMs?: number;
  ackClientId?: string;
  ackStatus?: string;
  detail?: string;
  markerId?: string;
  markerLabel?: string;
}

export interface CompleteCommandHistoryOptions {
  status: Exclude<CommandStatus, "pending">;
  ack: MessageEnvelope | null;
  completedAt: string;
  detail?: string;
}

export function commandRecipients(clients: HubClient[]): HubClient[] {
  return clients.filter((client) => client.subscriptions.includes(COMMAND_TOPIC));
}

export function canDispatchPauseSession(
  clients: HubClient[],
  isDispatching: boolean,
  sessionState: Pick<SessionStateSummary, "state">,
): boolean {
  return commandRecipients(clients).length > 0 && !isDispatching && sessionState.state !== "paused";
}

export function canDispatchResumeSession(
  clients: HubClient[],
  isDispatching: boolean,
  sessionState: Pick<SessionStateSummary, "state">,
): boolean {
  return commandRecipients(clients).length > 0 && !isDispatching && sessionState.state === "paused";
}

export function canDispatchAddMarker(clients: HubClient[], isDispatching: boolean, label: string): boolean {
  return commandRecipients(clients).length > 0 && !isDispatching && label.trim().length > 0;
}

/**
 * Markers são anotações da timeline: ao contrário de pause/resume, não exigem um
 * cliente inscrito em unreal.commands. Basta um rótulo e nenhum comando em curso.
 */
export function canAnnotateMarker(isDispatching: boolean, label: string): boolean {
  return !isDispatching && label.trim().length > 0;
}

export function createPendingCommandHistoryItem(
  command: MessageEnvelope,
  sentAt: string,
  runId?: string,
): CommandHistoryItem {
  const commandArguments = command.payload?.arguments;
  return {
    messageId: command.id ?? "untracked",
    action: readStringPayload(command, "action") ?? "unknown",
    target: readStringPayload(command, "target") ?? "all",
    ...(runId ? { runId } : {}),
    sentAt,
    status: "pending",
    markerId: readStringRecord(commandArguments, "markerId"),
    markerLabel: readStringRecord(commandArguments, "label"),
  };
}

export function completeCommandHistoryItem(
  item: CommandHistoryItem,
  options: CompleteCommandHistoryOptions,
): CommandHistoryItem {
  const ackStatus = readStringPayload(options.ack, "status");
  return {
    ...item,
    status: options.status,
    completedAt: options.completedAt,
    durationMs: Math.max(0, Date.parse(options.completedAt) - Date.parse(item.sentAt)),
    ackClientId: readStringPayload(options.ack, "clientId"),
    ackStatus,
    detail: options.detail ?? readStringPayload(options.ack, "detail") ?? (ackStatus ? `ACK ${ackStatus}` : undefined),
  };
}

export function commandStatusTone(status: CommandStatus): "ok" | "warn" | "error" | "muted" {
  if (status === "accepted") return "ok";
  if (status === "pending") return "warn";
  if (status === "rejected" || status === "timeout" || status === "failed") return "error";
  return "muted";
}

export function commandRowClass(status: CommandStatus): string {
  if (status === "pending") return "warn-row";
  if (status === "rejected" || status === "timeout" || status === "failed") return "error-row";
  return "";
}

/** O ACK diz que o cliente aceitou; a observação diz que o efeito apareceu no stream. */
export type CommandObservation = "observed" | "awaiting" | "not_applicable";

export function commandObservation(
  item: CommandHistoryItem,
  sessionState: Pick<SessionStateSummary, "state" | "lastCommandId">,
  events: StreamEvent[] = [],
): CommandObservation {
  if (item.status !== "accepted") {
    return "not_applicable";
  }
  if (item.action === "add-marker") {
    return markerEventObserved(item, events) ? "observed" : "awaiting";
  }
  const expectedState = expectedStateForCommand(item.action);
  if (!expectedState) {
    return "not_applicable";
  }
  const stateMatches = sessionState.state === expectedState;
  const commandMatches = !sessionState.lastCommandId || sessionState.lastCommandId === item.messageId;
  return stateMatches && commandMatches ? "observed" : "awaiting";
}

export function commandObservedStateDetail(
  item: CommandHistoryItem,
  sessionState: Pick<SessionStateSummary, "state" | "lastCommandId">,
  events: StreamEvent[] = [],
): string {
  const observation = commandObservation(item, sessionState, events);
  if (observation === "not_applicable") {
    return item.detail ?? "--";
  }
  const base = item.detail ?? "ACK accepted";
  if (item.action === "add-marker") {
    return observation === "observed" ? `${base}; marker observado na timeline` : `${base}; aguardando o evento de marker`;
  }
  return observation === "observed"
    ? `${base}; estado ${expectedStateForCommand(item.action)} confirmado`
    : `${base}; aguardando atualização de estado`;
}

export function markerEventObserved(item: CommandHistoryItem, events: StreamEvent[]): boolean {
  return events.some((event) => {
    if (event.envelope.topic !== "experience.marker") {
      return false;
    }
    const payload = event.envelope.payload ?? {};
    const markerId = readStringRecord(payload, "markerId");
    const commandId = readStringRecord(payload, "commandId");
    return Boolean((item.markerId && markerId === item.markerId) || commandId === item.messageId);
  });
}

function expectedStateForCommand(action: string): "paused" | "running" | null {
  if (action === "pause-session") return "paused";
  if (action === "resume-session") return "running";
  return null;
}

function readStringPayload(envelope: MessageEnvelope | null | undefined, key: string): string | undefined {
  const value = envelope?.payload?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringRecord(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}
