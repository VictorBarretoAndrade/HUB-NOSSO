export interface HealthResponse {
  ok: boolean;
  service: string;
  sessionId: string;
  pendingAcks: number;
  pendingLogWrites?: number;
  sessionLogError?: string | null;
}

export interface ClientOutboxStatus {
  size: number;
  reliableSize?: number;
  latestSize?: number;
  maxReliable?: number;
  maxLatest?: number;
  coalescedCount?: number;
  droppedCount?: number;
  overflowCount?: number;
  closed?: boolean;
  closeReason?: string | null;
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
  outbox?: ClientOutboxStatus;
  connectedAt?: string;
  lastSeenAt?: string;
  messageCount?: number;
}

export interface PendingAck {
  messageId: string;
  recipientClientId: string;
  publisherClientId: string;
}

export type ManagedSensorState =
  | "configured"
  | "available"
  | "connecting"
  | "connected"
  | "recording"
  | "stale"
  | "error"
  | "disconnected";

export type SensorProviderState = "ready" | "unavailable" | "disabled" | "error";

export interface SensorProviderStatus {
  providerId: string;
  state: SensorProviderState;
  discoveredCount?: number;
  supportedCount?: number;
  unsupportedCount?: number;
  lastScanAt?: string | null;
  reason?: string | null;
  error?: string | null;
}

export interface LslChannelMetadata {
  index?: number;
  label?: string;
  unit?: string;
  type?: string;
}

export interface LslStreamMetadata {
  name?: string;
  type?: string;
  uid?: string;
  sourceId?: string;
  host?: string;
  hostname?: string;
  channelCount?: number;
  nominalSrateHz?: number;
  channelFormat?: string;
  channels?: LslChannelMetadata[];
  labels?: string[];
  units?: string[];
}

export interface LslSyncMetadata {
  status?: string;
  timeCorrectionSec?: number | null;
  timeCorrectionAgeSec?: number | null;
  reason?: string | null;
  correctionStatus?: string | null;
  correctionReason?: string | null;
}

export interface SensorFreshnessStatus {
  status?: string;
  ageMs?: number | null;
  staleForMs?: number | null;
  staleAfterMs?: number | null;
  hasReceivedSample?: boolean;
}

export interface ManagedSensorMetadata extends Record<string, unknown> {
  lsl?: LslStreamMetadata;
  stream?: LslStreamMetadata;
  sync?: LslSyncMetadata;
}

export interface ManagedSensorStatus {
  sensorId: string;
  adapterId: string;
  providerId?: string | null;
  source: "lsl" | "direct_adapter" | "simulator" | string;
  displayName?: string;
  deviceType?: string;
  topics: string[];
  state: ManagedSensorState;
  armedForNextRun?: boolean;
  attachedRunId?: string | null;
  lastSampleAt?: string | null;
  lastStatusAt?: string | null;
  lastError?: string | null;
  quality?: string;
  recordingGateOpen?: boolean;
  freshness?: SensorFreshnessStatus;
  adapterStatus?: Record<string, unknown>;
  metadata?: ManagedSensorMetadata;
  stream?: LslStreamMetadata;
  sync?: LslSyncMetadata;
}

export interface SensorManagerStatus {
  clientId: string;
  sensorCount: number;
  adapterCount: number;
  armedCount?: number;
  recordingCount: number;
  activeRunId?: string | null;
  providers?: SensorProviderStatus[];
  sensors: ManagedSensorStatus[];
}

export interface ExperienceLifecycleStatus {
  activeRunId?: string | null;
}

export interface StatusResponse {
  ok: boolean;
  service: string;
  sessionId: string;
  clientCount: number;
  pendingAckCount: number;
  clients: HubClient[];
  pendingAcks: PendingAck[];
  sensorManager?: SensorManagerStatus;
  experienceLifecycle?: ExperienceLifecycleStatus;
}

export type SocketState = "idle" | "connecting" | "connected" | "reconnecting" | "error";

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
