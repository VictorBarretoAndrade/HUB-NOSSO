export interface HealthResponse {
  ok: boolean;
  service: string;
  sessionId: string;
  pendingAcks: number;
}

export interface HubClient {
  clientId: string;
  role: string;
  capabilities: string[];
  displayName?: string;
  deviceType?: string;
  metadata?: Record<string, unknown>;
  subscriptions: string[];
  outboxSize: number;
  connectedAt?: string;
  lastSeenAt?: string;
  messageCount?: number;
}

export interface PendingAck {
  messageId: string;
  recipientClientId: string;
  publisherClientId: string;
}

export interface StatusResponse {
  ok: boolean;
  service: string;
  sessionId: string;
  clientCount: number;
  pendingAckCount: number;
  clients: HubClient[];
  pendingAcks: PendingAck[];
}

export type SocketState = "idle" | "connecting" | "connected" | "error";

export interface MessageEnvelope {
  version?: number;
  id?: string;
  type: "hello" | "subscribe" | "unsubscribe" | "publish" | "ack" | "error";
  topic?: string | null;
  clientId: string;
  correlationId?: string | null;
  requiresAck?: boolean;
  collectedAt?: string | null;
  hubReceivedAt?: string | null;
  sessionTimeMs?: number | null;
  payload?: Record<string, unknown>;
}

export interface StreamEvent {
  receivedAt: string;
  envelope: MessageEnvelope;
}
