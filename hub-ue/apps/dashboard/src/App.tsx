import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Command,
  Database,
  Download,
  FileText,
  Gauge,
  RefreshCw,
  Search,
  Send,
  Settings,
  Users,
  UserPlus,
} from "lucide-react";
import {
  buildHello,
  buildMonitorSubscribe,
  buildUnrealCommand,
  fetchHealth,
  fetchStatus,
  normalizeHttpEndpoint,
  publishUnrealCommand,
  toWebSocketEndpoint,
} from "./api";
import type { UnrealCommandAction } from "./api";
import {
  canDispatchAddMarker,
  canDispatchPauseSession,
  canDispatchResumeSession,
  commandObservedStateDetail,
  commandRecipients,
  commandRowClass,
  commandStatusTone,
  completeCommandHistoryItem,
  createPendingCommandHistoryItem,
} from "./commandHistory";
import type { CommandHistoryItem } from "./commandHistory";
import {
  activeTopicCount,
  deriveReadiness,
  eventSeverity,
  latestPendingAck,
  requiredActions,
  summarizePayload,
} from "./domain";
import {
  deriveAnalyticSessionTimeline,
  endExperienceRun,
  formatExperienceTime,
  resetExperienceRun,
  resumeExperienceRun,
  serializeExperienceRunCsv,
  serializeExperienceRunJson,
  startExperienceRun,
  startNextExperienceRun,
  pauseExperienceRun,
  summarizeExperienceRun,
} from "./experienceRun";
import type { AnalyticSessionTimelineItem, ExperienceRunState, ExperienceRunSummary } from "./experienceRun";
import {
  applyExperienceLifecycleEvent,
  lifecycleSummaryFromEvent,
} from "./experienceLifecycle";
import {
  commandIssueCount,
  deriveExperienceReport,
  deriveExperienceReportHealth,
  serializeBiometricsSummaryCsv,
  serializeExperienceReportCsv,
  serializeExperienceReportJson,
  serializeMarkerSnapshotsCsv,
} from "./experienceReport";
import type { ExperienceReport, ExperienceReportHealth } from "./experienceReport";
import {
  buildBiometricChartModel,
  markerGroupExpansionLayout,
  markerGroupPopoverLayout,
  serializeBiometricsTimelineCsv,
} from "./experienceAnalytics";
import type {
  BiometricChartLane,
  BiometricChartMarkerGroup,
  MarkerGroupExpansionItem,
  SensorAnalyticsSeries,
} from "./experienceAnalytics";
import {
  appendExperienceEvent,
  buildPersistedExperienceSession,
  clearExperienceSession,
  loadExperienceSession,
  saveExperienceSession,
} from "./experiencePersistence";
import { latestExperienceMarker } from "./markers";
import type { ExperienceMarkerSummary } from "./markers";
import {
  buildSessionControlTabs,
  buildSensorListRows,
  primarySensorSummary,
  summarizeRunHeader,
} from "./sessionControlUi";
import type { RunHeaderSummary, SessionControlTab } from "./sessionControlUi";
import {
  deriveSensorDataStream,
  deriveSensorTelemetrySummaries,
  formatSensorAge,
  sensorSignalLabel,
  sensorSignalTone,
  serializeSensorDataStreamJson,
} from "./sensorTelemetry";
import type { SensorDataStreamSnapshot, SensorTelemetrySummary } from "./sensorTelemetry";
import { deriveSessionState, sessionStateLabel } from "./sessionState";
import type { ObservedSessionState, SessionStateSummary } from "./sessionState";
import {
  MARKER_PRESETS,
  deriveTimelineFilterOptions,
  filterSessionTimeline,
} from "./timelineTools";
import type { TimelineKindFilter } from "./timelineTools";
import { SubjectView } from "./SubjectView";
import { loadSubjectProfile, saveSubjectProfile, subjectSnapshotForRun } from "./subjectProfile";
import type { SubjectProfile, SubjectSnapshot } from "./subjectProfile";
import { TOPICS } from "./topics";
import type { HealthResponse, HubClient, MessageEnvelope, SocketState, StatusResponse, StreamEvent } from "./types";

type View = "overview" | "subject" | "session" | "clients" | "topics" | "diagnostics";

const STORAGE_ENDPOINT_KEY = "biofeedback-dashboard.endpoint";
const STORAGE_TOKEN_KEY = "biofeedback-dashboard.token";
const DEFAULT_ENDPOINT = "http://127.0.0.1:8787";

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "subject", label: "Subject", icon: UserPlus },
  { id: "session", label: "Session Control", icon: Command },
  { id: "clients", label: "Clients", icon: Users },
  { id: "topics", label: "Topics", icon: FileText },
  { id: "diagnostics", label: "Diagnostics", icon: Settings },
];

export function App() {
  const [initialExperienceSession] = useState(() => loadExperienceSession(localStorage));
  const [view, setView] = useState<View>("overview");
  const [subjectProfile, setSubjectProfile] = useState<SubjectProfile | null>(() => loadSubjectProfile(localStorage));
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem(STORAGE_ENDPOINT_KEY) ?? DEFAULT_ENDPOINT);
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN_KEY) ?? "");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [experienceEvents, setExperienceEvents] = useState<StreamEvent[]>(() => initialExperienceSession?.experienceEvents ?? []);
  const [experienceRun, setExperienceRun] = useState<ExperienceRunState>(() => initialExperienceSession?.experienceRun ?? resetExperienceRun());
  const [experienceWasRestored, setExperienceWasRestored] = useState(() => initialExperienceSession !== null);
  const [experienceLifecycleNotice, setExperienceLifecycleNotice] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [overviewSensorId, setOverviewSensorId] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("");
  const [socketState, setSocketState] = useState<SocketState>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>(() => initialExperienceSession?.commandHistory ?? []);
  const [isDispatchingCommand, setIsDispatchingCommand] = useState(false);
  const experienceRunRef = useRef(experienceRun);
  const socketRef = useRef<WebSocket | null>(null);
  const dynamicTopicSubscriptionsRef = useRef<Set<string>>(new Set());

  const normalizedEndpoint = useMemo(() => normalizeHttpEndpoint(endpoint), [endpoint]);
  const clients = status?.clients ?? [];
  const filteredClients = useMemo(
    () => clients.filter((client) => clientFilter === "all" || client.role === clientFilter),
    [clients, clientFilter],
  );
  const selectedClient = useMemo(
    () => clients.find((client) => client.clientId === selectedClientId) ?? filteredClients[0] ?? null,
    [clients, filteredClients, selectedClientId],
  );
  const readiness = useMemo(() => deriveReadiness(health, status), [health, status]);
  const sessionEvents = useMemo(
    () => [...events, ...experienceEvents].sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt)),
    [events, experienceEvents],
  );
  const sessionState = useMemo(() => deriveSessionState(sessionEvents), [sessionEvents]);
  const sensorTelemetry = useMemo(() => deriveSensorTelemetrySummaries(clients, events), [clients, events]);
  const sensorDataStream = useMemo(() => deriveSensorDataStream(clients, events, 200), [clients, events]);
  const latestMarker = useMemo(() => latestExperienceMarker(sessionEvents), [sessionEvents]);
  const actions = useMemo(() => requiredActions(health, status), [health, status]);
  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        if (!topicFilter.trim()) {
          return true;
        }
        const query = topicFilter.trim().toLowerCase();
        return (
          event.envelope.topic?.toLowerCase().includes(query) ||
          event.envelope.clientId.toLowerCase().includes(query) ||
          event.envelope.type.toLowerCase().includes(query)
        );
      }),
    [events, topicFilter],
  );

  const refresh = async () => {
    try {
      const [nextHealth, nextStatus] = await Promise.all([
        fetchHealth(normalizedEndpoint),
        fetchStatus(normalizedEndpoint),
      ]);
      setHealth(nextHealth);
      setStatus(nextStatus);
      setLastError(null);
    } catch (error) {
      setHealth(null);
      setStatus(null);
      setLastError(error instanceof Error ? error.message : "Unable to reach hub");
    }
  };

  const dispatchUnrealAction = async (action: UnrealCommandAction, commandArguments: Record<string, unknown> = { reason: "dashboard" }) => {
    const command = buildUnrealCommand({
      action,
      arguments: commandArguments,
    });
    const messageId = command.id ?? "untracked";
    const pendingCommand = createPendingCommandHistoryItem(command, new Date().toISOString());

    setCommandHistory((current) => [pendingCommand, ...current].slice(0, 10));
    setIsDispatchingCommand(true);

    try {
      const result = await publishUnrealCommand(normalizedEndpoint, token, command);
      setCommandHistory((current) =>
        current.map((item) =>
          item.messageId === messageId
            ? completeCommandHistoryItem(item, {
                status: result.status,
                ack: result.ack,
                completedAt: new Date().toISOString(),
                detail: result.detail,
              })
            : item,
        ),
      );
    } catch (error) {
      setCommandHistory((current) =>
        current.map((item) =>
          item.messageId === messageId
            ? completeCommandHistoryItem(item, {
                status: "failed",
                ack: null,
                completedAt: new Date().toISOString(),
                detail: error instanceof Error ? error.message : "Command dispatch failed",
              })
            : item,
        ),
      );
    } finally {
      setIsDispatchingCommand(false);
      void refresh();
    }
  };

  const publishLifecycleEvent = (
    event: "started" | "ended",
    runId: string,
    label?: string,
  ) => {
    const lifecycleEndpoint = normalizedEndpoint.endsWith("/ws")
      ? normalizedEndpoint
      : `${normalizedEndpoint.replace(/\/$/, "")}/ws`;

    console.log("[dashboard] publishLifecycleEvent called", {
      event,
      runId,
      label,
      normalizedEndpoint,
      lifecycleEndpoint,
    });

    const ws = new WebSocket(lifecycleEndpoint);

    ws.onopen = () => {
      console.log("[dashboard] lifecycle WebSocket opened");

      ws.send(
        JSON.stringify({
          type: "hello",
          clientId: "dashboard-lifecycle",
          payload: {
            clientId: "dashboard-lifecycle",
            role: "dashboard",
            capabilities: ["experience-lifecycle"],
          },
        }),
      );

      const message = {
        type: "publish",
        clientId: "dashboard-lifecycle",
        topic: "experience.lifecycle",
        requiresAck: false,
        payload: {
          event,
          runId,
          label,
          source: "dashboard",
          reason: "ui",
          ...(subjectProfile ? { subject: subjectSnapshotForRun(subjectProfile) } : {}),
        },
      };

      console.log("[dashboard] sending lifecycle message", message);
      ws.send(JSON.stringify(message));

      setTimeout(() => {
        console.log("[dashboard] lifecycle WebSocket closing");
        ws.close();
      }, 1000);
    };

    ws.onclose = (event) => {
      console.log("[dashboard] lifecycle WebSocket closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
    };

    ws.onerror = (error) => {
      console.error("[dashboard] failed to publish experience.lifecycle", error);
    };
  };

  const exportSensorDataStream = () => {
    const exportedAt = new Date().toISOString();
    const stamp = exportedAt.replace(/[:.]/g, "-");
    downloadTextFile(
      `biofeedback-sensor-data-${stamp}.json`,
      serializeSensorDataStreamJson(sensorDataStream, exportedAt),
      "application/json",
    );
  };

  const startExperience = () => {
    const now = new Date().toISOString();
    const runId = crypto.randomUUID();
    const label = "Dashboard Experience";

    const nextRun = startExperienceRun(now, {
      runId,
      source: "dashboard",
      label,
    });

    experienceRunRef.current = nextRun;
    setExperienceRun(nextRun);
    setExperienceEvents([]);
    setExperienceLifecycleNotice(null);
    setExperienceWasRestored(false);

    publishLifecycleEvent("started", runId, label);
  };

  const endExperience = () => {
    const endedAt = new Date().toISOString();
    const runId = experienceRunRef.current.runId;

    setExperienceRun((current) => {
      const nextRun = endExperienceRun(current, endedAt);
      experienceRunRef.current = nextRun;
      return nextRun;
    });

    setExperienceLifecycleNotice(null);
    setExperienceWasRestored(false);

    if (runId) {
      publishLifecycleEvent("ended", runId);
    }
  };

  const startNewExperience = () => {
    const now = new Date().toISOString();
    const runId = crypto.randomUUID();
    const label = "Dashboard Experience";

    const nextRun = startExperienceRun(now, {
      runId,
      source: "dashboard",
      label,
    });

    experienceRunRef.current = nextRun;
    setExperienceRun(nextRun);
    setExperienceEvents([]);
    setCommandHistory([]);
    setExperienceLifecycleNotice(null);
    setExperienceWasRestored(false);

    publishLifecycleEvent("started", runId, label);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_ENDPOINT_KEY, normalizedEndpoint);
  }, [normalizedEndpoint]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
  }, [token]);

  useEffect(() => {
    if (subjectProfile) {
      saveSubjectProfile(localStorage, subjectProfile);
    }
  }, [subjectProfile]);

  useEffect(() => {
    experienceRunRef.current = experienceRun;
  }, [experienceRun]);

  useEffect(() => {
    if (!sessionState.receivedAt) {
      return;
    }
    setExperienceRun((current) => {
      let nextRun = current;
      if (sessionState.state === "paused") {
        nextRun = pauseExperienceRun(current, sessionState.receivedAt!);
      } else if (sessionState.state === "running") {
        nextRun = resumeExperienceRun(current, sessionState.receivedAt!);
      }
      experienceRunRef.current = nextRun;
      return nextRun;
    });
  }, [sessionState.receivedAt, sessionState.state]);

  useEffect(() => {
    if (overviewSensorId && sensorTelemetry.some((summary) => summary.clientId === overviewSensorId)) {
      return;
    }
    setOverviewSensorId(sensorTelemetry[0]?.clientId ?? "");
  }, [overviewSensorId, sensorTelemetry]);

  useEffect(() => {
    const hasLocalExperience =
      experienceRun.status !== "not_started" || experienceEvents.length > 0 || commandHistory.length > 0;
    if (!hasLocalExperience) {
      clearExperienceSession(localStorage);
      return;
    }
    saveExperienceSession(
      localStorage,
      buildPersistedExperienceSession(experienceRun, experienceEvents, commandHistory),
    );
  }, [commandHistory, experienceEvents, experienceRun]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(interval);
  }, [normalizedEndpoint]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let cancelled = false;
    dynamicTopicSubscriptionsRef.current = new Set();

    try {
      setSocketState("connecting");
      socket = new WebSocket(toWebSocketEndpoint(normalizedEndpoint, token));
      socketRef.current = socket;
    } catch (error) {
      setSocketState("error");
      setLastError(error instanceof Error ? error.message : "Unable to open WebSocket");
      return;
    }

    socket.onopen = () => {
      if (cancelled || !socket) {
        return;
      }
      socket.send(JSON.stringify(buildHello()));
      socket.send(JSON.stringify(buildMonitorSubscribe()));
      setSocketState("connected");
    };
    socket.onmessage = (message) => {
      try {
        const envelope = JSON.parse(String(message.data)) as MessageEnvelope;
        const streamEvent = { receivedAt: new Date().toISOString(), envelope };
        setEvents((current) => [streamEvent, ...current].slice(0, 200));
        const lifecycle = lifecycleSummaryFromEvent(streamEvent);
        let run = experienceRunRef.current;
        let shouldCaptureLifecycle = false;
        if (lifecycle) {
          const result = applyExperienceLifecycleEvent(run, lifecycle);
          if (result.startedNewRun) {
            setExperienceEvents([]);
            setCommandHistory([]);
          }
          if (result.applied) {
            run = result.run;
            experienceRunRef.current = result.run;
            setExperienceRun(result.run);
            setExperienceWasRestored(false);
            setExperienceLifecycleNotice(null);
            shouldCaptureLifecycle = true;
          } else if (result.conflict) {
            setExperienceLifecycleNotice(result.conflict);
          }
        }
        if (shouldCaptureLifecycle || run.status === "running" || run.status === "paused") {
          setExperienceEvents((current) => appendExperienceEvent(current, streamEvent));
        }
      } catch {
        setLastError("Received an unreadable WebSocket message");
      }
    };
    socket.onerror = () => {
      setSocketState("error");
      setLastError("WebSocket connection failed");
    };
    socket.onclose = () => {
      if (!cancelled) {
        setSocketState("error");
      }
    };

    return () => {
      cancelled = true;
      socketRef.current = null;
      socket?.close();
    };
  }, [normalizedEndpoint, token]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!status || socketState !== "connected" || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const knownTopics = new Set<string>(TOPICS);
    const dynamicTopics = sensorPublishTopics(status).filter(
      (topic) => !knownTopics.has(topic) && !dynamicTopicSubscriptionsRef.current.has(topic),
    );
    if (dynamicTopics.length === 0) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "subscribe",
        clientId: "dashboard-ui",
        payload: { topics: dynamicTopics },
      }),
    );
    for (const topic of dynamicTopics) {
      dynamicTopicSubscriptionsRef.current.add(topic);
    }
  }, [socketState, status]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="product-mark">Biofeedback Hub</p>
          <p className="operator-id">operator_local</p>
        </div>
        <nav className="nav-list" aria-label="Dashboard sections">
          {NAV_ITEMS.map((item) => (
            <button
              className={`nav-button ${view === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setView(item.id)}
              type="button"
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-frame">
        <header className="topbar">
          <div>
            <p className="eyebrow">Biofeedback Hub UE</p>
            <h1>{titleForView(view)}</h1>
          </div>
          <div className="topbar-actions">
            <StatusPill tone={health?.ok ? "ok" : "error"} label={health?.ok ? "Connected" : "Offline"} />
            <span className="session-id">{health?.sessionId ?? "no-session"}</span>
            <IconButton label="Refresh status" onClick={() => void refresh()}>
              <RefreshCw size={16} />
            </IconButton>
            <Bell size={17} className={status?.pendingAckCount ? "warn-icon" : "muted-icon"} />
          </div>
        </header>

        {view === "overview" && (
          <OverviewView
            actions={actions}
            activeTopics={activeTopicCount(status)}
            clients={clients}
            events={events}
            health={health}
            lastError={lastError}
            readiness={readiness}
            sensorDataStream={sensorDataStream}
            selectedSensorId={overviewSensorId}
            sensorSummaries={sensorTelemetry}
            latestMarker={latestMarker}
            sessionState={sessionState}
            status={status}
            onExportSensorDataJson={exportSensorDataStream}
            onSelectSensor={setOverviewSensorId}
            onRefresh={() => void refresh()}
          />
        )}
        {view === "subject" && (
          <SubjectView profile={subjectProfile} onChange={setSubjectProfile} />
        )}
        {view === "session" && (
          <SessionControlView
            commandHistory={commandHistory}
            events={experienceEvents}
            experienceRun={experienceRun}
            experienceLifecycleNotice={experienceLifecycleNotice}
            experienceWasRestored={experienceWasRestored}
            isDispatching={isDispatchingCommand}
            sensorSummaries={sensorTelemetry}
            sessionState={sessionState}
            status={status}
            onClearHistory={() => setCommandHistory([])}
            onCommand={(action, commandArguments) => void dispatchUnrealAction(action, commandArguments)}
            onEndExperience={endExperience}
            onExportSensorDataJson={exportSensorDataStream}
            onStartExperience={startExperience}
            onStartNewExperience={startNewExperience}
            subject={subjectProfile ? subjectSnapshotForRun(subjectProfile) : undefined}
          />
        )}
        {view === "clients" && (
          <ClientsView
            clientFilter={clientFilter}
            clients={filteredClients}
            sensorSummaries={sensorTelemetry}
            selectedClient={selectedClient}
            setClientFilter={setClientFilter}
            setSelectedClientId={setSelectedClientId}
            status={status}
          />
        )}
        {view === "topics" && (
          <TopicsView
            events={visibleEvents}
            socketState={socketState}
            topicFilter={topicFilter}
            setTopicFilter={setTopicFilter}
          />
        )}
        {view === "diagnostics" && (
          <DiagnosticsView
            endpoint={endpoint}
            health={health}
            lastError={lastError}
            normalizedEndpoint={normalizedEndpoint}
            setEndpoint={setEndpoint}
            setToken={setToken}
            socketState={socketState}
            status={status}
            token={token}
          />
        )}
      </main>
    </div>
  );
}

function OverviewView(props: {
  actions: string[];
  activeTopics: number;
  clients: HubClient[];
  events: StreamEvent[];
  health: HealthResponse | null;
  lastError: string | null;
  latestMarker: ExperienceMarkerSummary | null;
  readiness: ReturnType<typeof deriveReadiness>;
  sensorDataStream: SensorDataStreamSnapshot;
  selectedSensorId: string;
  sensorSummaries: SensorTelemetrySummary[];
  sessionState: SessionStateSummary;
  status: StatusResponse | null;
  onExportSensorDataJson: () => void;
  onSelectSensor: (sensorId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="content-grid overview-grid">
      {props.lastError && <div className="alert-line">{props.lastError}</div>}

      <Panel
        className="readiness-panel overview-wide"
        title="System readiness"
        action={
          <div className="panel-actions">
            <StatusPill tone={props.health?.ok ? "ok" : "error"} label={props.health?.ok ? "Session visible" : "Hub offline"} />
            <button className="mini-button" type="button" onClick={props.onRefresh}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        }
      >
        <div className="readiness-row">
          <div className={`readiness-cell ${readinessToneForSession(props.sessionState.state)}`}>
            <Activity size={22} />
            <strong>Session</strong>
            <span>{sessionStateLabel(props.sessionState.state)}</span>
          </div>
          {props.readiness.map((item) => (
            <div className={`readiness-cell ${item.tone}`} key={item.label}>
              <Activity size={22} />
              <strong>{item.label}</strong>
              <span>{item.state}</span>
            </div>
          ))}
        </div>
        <div className="overview-metrics">
          <Metric label="Clients" value={props.status?.clientCount ?? props.clients.length} />
          <Metric label="Pending ACKs" value={props.status?.pendingAckCount ?? props.health?.pendingAcks ?? 0} />
          <Metric label="Active topics" value={props.activeTopics} />
          <Metric label="Last marker" value={props.latestMarker?.label ?? "--"} small />
        </div>
        <SensorOverviewStrip
          dataStream={props.sensorDataStream}
          selectedSensorId={props.selectedSensorId}
          summaries={props.sensorSummaries}
          onSelectSensor={props.onSelectSensor}
        />
      </Panel>

      <Panel title="Required actions">
        <ul className="required-list">
          {props.actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </Panel>

      <Panel className="event-panel" title="Recent events">
        <OverviewEventList events={props.events.slice(0, 5)} />
      </Panel>

      <SensorDataStreamPanel snapshot={props.sensorDataStream} onExportJson={props.onExportSensorDataJson} />
    </section>
  );
}

function SensorDataStreamPanel({
  onExportJson,
  snapshot,
}: {
  onExportJson: () => void;
  snapshot: SensorDataStreamSnapshot;
}) {
  const visibleRows = snapshot.rows.slice(0, 30);

  return (
    <Panel
      className="sensor-data-panel overview-wide"
      title="Live sensor data"
      action={
        <div className="panel-actions">
          <StatusPill tone={snapshot.rows.length > 0 ? "ok" : "muted"} label={`${snapshot.totalSamples} sample${snapshot.totalSamples === 1 ? "" : "s"}`} />
          <button className="mini-button strong" disabled={snapshot.rows.length === 0} type="button" onClick={onExportJson}>
            <Download size={14} /> Save JSON
          </button>
        </div>
      }
    >
      <div className="sensor-data-summary">
        <SensorMetric label="Devices" value={snapshot.clientCount} />
        <SensorMetric label="Topics" value={snapshot.topicCount} />
        <SensorMetric label="Showing" value={visibleRows.length} />
      </div>
      {visibleRows.length === 0 ? (
        <p className="empty-state">Waiting for sensor publish events. Any connected WebSocket device with sensor-like topics or payloads will appear here.</p>
      ) : (
        <table className="data-table sensor-data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Device</th>
              <th>Topic</th>
              <th>Measurement</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={`${row.receivedAt}-${row.clientId}-${row.topic}-${index}`}>
                <td className="mono">{formatTime(row.receivedAt)}</td>
                <td>
                  <strong>{row.displayName ?? row.clientId}</strong>
                  <span className="subtle-line mono">{row.deviceType ?? row.clientId}</span>
                </td>
                <td className="mono">{row.topic}</td>
                <td>
                  <span className="measurement-chip">{row.measurement}</span>
                  {typeof row.sequence === "number" && <span className="subtle-line mono">seq {row.sequence}</span>}
                </td>
                <td className="sensor-data-payload">{row.payloadPreview}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function SensorOverviewStrip({
  dataStream,
  onSelectSensor,
  selectedSensorId,
  summaries,
}: {
  dataStream: SensorDataStreamSnapshot;
  onSelectSensor: (sensorId: string) => void;
  selectedSensorId: string;
  summaries: SensorTelemetrySummary[];
}) {
  const selected = summaries.find((summary) => summary.clientId === selectedSensorId);
  const primary = selected ?? primarySensorSummary(summaries);
  const latestRow = primary ? dataStream.rows.find((row) => row.clientId === primary.clientId) : undefined;

  if (!primary) {
    return (
      <div className="sensor-overview-strip empty">
        <div className="sensor-headline">
          <span>Sensor readiness</span>
          <strong>No sensors connected</strong>
        </div>
        <p className="muted-copy">Connect any WebSocket sensor or HRV adapter to populate live biometrics.</p>
      </div>
    );
  }

  return (
    <div className={`sensor-overview-strip ${primary.signalState}`}>
      <div className="sensor-headline">
        <span>Sensor readiness</span>
        <strong>{primary.device ?? primary.clientId}</strong>
        <StatusPill tone={sensorSignalTone(primary.signalState)} label={sensorSignalLabel(primary.signalState)} />
        {summaries.length > 1 && (
          <label className="sensor-selector">
            <span>Viewing</span>
            <select value={primary.clientId} onChange={(event) => onSelectSensor(event.target.value)}>
              {summaries.map((summary) => (
                <option key={summary.clientId} value={summary.clientId}>
                  {summary.device ?? summary.clientId}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="sensor-mini-grid">
        <SensorMetric label="Sensors" value={summaries.length} />
        {typeof primary.bpm === "number" || typeof primary.rrMs === "number" ? (
          <>
            <SensorMetric label="BPM" value={formatBpm(primary.bpm)} />
            <SensorMetric label="RR" value={formatRrMs(primary.rrMs)} />
          </>
        ) : (
          <>
            <SensorMetric label="Measurement" value={latestRow?.measurement ?? "--"} />
            <SensorMetric label="Topic" value={latestRow?.topic ?? primary.topic ?? "--"} />
          </>
        )}
        <SensorMetric label="Last sample" value={formatSensorAge(primary.lastSampleAgeMs)} />
      </div>
    </div>
  );
}

function SensorClientDetail({ client, summary }: { client: HubClient; summary: SensorTelemetrySummary | null }) {
  const signalState = summary?.signalState ?? "unknown";

  return (
    <div className="sensor-detail-block">
      <div className="sensor-detail-header">
        <StatusPill tone={sensorSignalTone(signalState)} label={sensorSignalLabel(signalState)} />
        <span className="mono">{client.subscriptions.length === 0 ? "publisher only" : `${client.subscriptions.length} subscriptions`}</span>
      </div>
      <Metric label="BPM" value={formatBpm(summary?.bpm)} />
      <Metric label="RR" value={formatRrMs(summary?.rrMs)} />
      <Metric label="IBI samples" value={summary?.ibiSampleCount ?? "--"} />
      <Metric label="Last topic" value={summary?.topic ?? "--"} small />
      <Metric label="Last sample" value={formatSensorAge(summary?.lastSampleAgeMs)} small />
      <Metric label="Samples/min" value={formatSamplesPerMinute(summary?.samplesPerMinute)} small />
    </div>
  );
}

function SensorMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="sensor-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SessionControlView({
  commandHistory,
  events,
  experienceLifecycleNotice,
  experienceRun,
  experienceWasRestored,
  isDispatching,
  onClearHistory,
  onCommand,
  onEndExperience,
  onExportSensorDataJson,
  onStartExperience,
  onStartNewExperience,
  sensorSummaries,
  sessionState,
  status,
  subject,
}: {
  commandHistory: CommandHistoryItem[];
  events: StreamEvent[];
  experienceLifecycleNotice: string | null;
  experienceRun: ExperienceRunState;
  experienceWasRestored: boolean;
  isDispatching: boolean;
  onClearHistory: () => void;
  onCommand: (action: UnrealCommandAction, commandArguments?: Record<string, unknown>) => void;
  onEndExperience: () => void;
  onExportSensorDataJson: () => void;
  onStartExperience: () => void;
  onStartNewExperience: () => void;
  sensorSummaries: SensorTelemetrySummary[];
  sessionState: SessionStateSummary;
  status: StatusResponse | null;
  subject?: SubjectSnapshot;
}) {
  const [confirmingAction, setConfirmingAction] = useState<UnrealCommandAction | null>(null);
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerNote, setMarkerNote] = useState("");
  const [timelineQuery, setTimelineQuery] = useState("");
  const [timelineSource, setTimelineSource] = useState("all");
  const [timelineKind, setTimelineKind] = useState<TimelineKindFilter>("all");
  const [activeTab, setActiveTab] = useState<SessionControlTab>(() => (experienceRun.status === "ended" ? "report" : "operate"));
  const [clockNow, setClockNow] = useState(() => new Date().toISOString());
  const latestAck = latestPendingAck(status?.pendingAcks ?? []);
  const commandClients = commandRecipients(status?.clients ?? []);
  const experienceIsActive = experienceRun.status === "running" || experienceRun.status === "paused";
  const canDispatchPause =
    experienceRun.status === "running" && canDispatchPauseSession(status?.clients ?? [], isDispatching, sessionState);
  const canDispatchResume =
    experienceRun.status === "paused" && canDispatchResumeSession(status?.clients ?? [], isDispatching, sessionState);
  const canDispatchMarker = experienceIsActive && canDispatchAddMarker(status?.clients ?? [], isDispatching, markerLabel);
  const timeline = useMemo(() => deriveAnalyticSessionTimeline(events, experienceRun, 200), [events, experienceRun]);
  const timelineFilterOptions = useMemo(() => deriveTimelineFilterOptions(timeline), [timeline]);
  const filteredTimeline = useMemo(
    () =>
      filterSessionTimeline(timeline, {
        kind: timelineKind,
        query: timelineQuery,
        source: timelineSource,
      }),
    [timeline, timelineKind, timelineQuery, timelineSource],
  );
  const hasUnrealClient = (status?.clients ?? []).some((client) => client.role === "unreal");
  const timelineFiltersActive = timelineQuery.trim().length > 0 || timelineSource !== "all" || timelineKind !== "all";
  const runSummary = useMemo(() => summarizeExperienceRun(experienceRun, timeline, clockNow), [clockNow, experienceRun, timeline]);
  const runHeader = useMemo(
    () => summarizeRunHeader(experienceRun, sessionState, sensorSummaries),
    [experienceRun, sensorSummaries, sessionState],
  );
  const report = useMemo(
    () => deriveExperienceReport(experienceRun, timeline, events, commandHistory),
    [commandHistory, events, experienceRun, timeline],
  );
  const pendingObservation = commandHistory.find(
    (item) =>
      item.status === "accepted" &&
      commandObservedStateDetail(item, sessionState, events).includes("waiting for"),
  );

  useEffect(() => {
    if (
      (confirmingAction === "pause-session" && !canDispatchPause) ||
      (confirmingAction === "resume-session" && !canDispatchResume) ||
      (confirmingAction === "add-marker" && !canDispatchMarker)
    ) {
      setConfirmingAction(null);
    }
  }, [canDispatchMarker, canDispatchPause, canDispatchResume, confirmingAction]);

  useEffect(() => {
    if (experienceRun.status !== "running" && experienceRun.status !== "paused") {
      return;
    }
    const interval = window.setInterval(() => setClockNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(interval);
  }, [experienceRun.status]);

  useEffect(() => {
    if (experienceRun.status === "ended") {
      setActiveTab("report");
    }
  }, [experienceRun.status]);

  const confirmCommand = () => {
    if (!confirmingAction) {
      return;
    }
    const action = confirmingAction;
    setConfirmingAction(null);
    if (action === "add-marker") {
      onCommand(action, buildMarkerArguments(markerLabel, markerNote, createMarkerId()));
      setMarkerLabel("");
      setMarkerNote("");
      return;
    }
    onCommand(action);
  };

  const startExperience = () => {
    onStartExperience();
    resetTimelineFilters();
    setClockNow(new Date().toISOString());
  };

  const endExperience = () => {
    onEndExperience();
    setClockNow(new Date().toISOString());
    setActiveTab("report");
  };

  const startNextExperience = () => {
    onStartNewExperience();
    resetTimelineFilters();
    setClockNow(new Date().toISOString());
    setActiveTab("operate");
  };

  const resetTimelineFilters = () => {
    setTimelineQuery("");
    setTimelineSource("all");
    setTimelineKind("all");
  };

  const exportTimeline = (items: AnalyticSessionTimelineItem[], format: "json" | "csv", scope: "visible" | "all") => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `biofeedback-experience-${scope}-${stamp}.${format}`;
    const content =
      format === "json"
        ? serializeExperienceRunJson(experienceRun, items, new Date().toISOString(), report)
        : serializeExperienceRunCsv(experienceRun, items, new Date().toISOString());
    const mimeType = format === "json" ? "application/json" : "text/csv";
    downloadTextFile(filename, content, mimeType);
  };

  const exportReport = (format: "json" | "csv") => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `biofeedback-experience-report-${stamp}.${format}`;
    const exportedAt = new Date().toISOString();
    const content =
      format === "json"
        ? serializeExperienceReportJson(report, exportedAt, { timeline, commandHistory, subject })
        : serializeExperienceReportCsv(report);
    const mimeType = format === "json" ? "application/json" : "text/csv";
    downloadTextFile(filename, content, mimeType);
  };

  const exportReportCsv = (kind: "markers" | "biometrics" | "biometrics-timeline") => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `biofeedback-experience-${kind}-${stamp}.csv`;
    const content =
      kind === "markers"
        ? serializeMarkerSnapshotsCsv(report)
        : kind === "biometrics"
          ? serializeBiometricsSummaryCsv(report)
          : serializeBiometricsTimelineCsv(report.analytics);
    downloadTextFile(filename, content, "text/csv");
  };

  return (
    <>
      <section className="content-grid session-grid session-control-layout">
        <div className="section-heading">
          <p>Active instance: {status?.sessionId ?? "none"} // connected clients: {status?.clientCount ?? 0}</p>
        </div>
        <ExperienceRunHeader
          header={runHeader}
          run={experienceRun}
          sessionState={sessionState}
          summary={runSummary}
          wasRestored={experienceWasRestored}
          onEnd={endExperience}
          onStart={startExperience}
          onStartNext={startNextExperience}
        />
        {pendingObservation && (
          <div className="observation-strip">
            <strong>Waiting for observed event</strong>
            <span>{commandObservedStateDetail(pendingObservation, sessionState, events)}</span>
          </div>
        )}
        {experienceLifecycleNotice && (
          <div className="observation-strip">
            <strong>Lifecycle notice</strong>
            <span>{experienceLifecycleNotice}</span>
          </div>
        )}
        <SessionControlTabs
          activeTab={activeTab}
          commandCount={commandHistory.length}
          runStatus={experienceRun.status}
          sensorCount={sensorSummaries.length}
          timelineCount={timeline.length}
          onTabChange={setActiveTab}
        />
        {activeTab === "operate" && (
          <div className="session-tab-panel operate-tab">
            <Panel
              title="Macro commands"
              action={
                <StatusPill
                  tone={commandClients.length > 0 ? "ok" : "warn"}
                  label={commandClients.length > 0 ? `${commandClients.length} subscriber${commandClients.length > 1 ? "s" : ""}` : "No command subscriber"}
                />
              }
            >
              <div className="macro-grid">
                <button
                  className="macro-button primary"
                  disabled={!canDispatchPause}
                  onClick={() => setConfirmingAction("pause-session")}
                  type="button"
                >
                  <Send size={18} />
                  Pause session
                </button>
                <button
                  className="macro-button primary"
                  disabled={!canDispatchResume}
                  onClick={() => setConfirmingAction("resume-session")}
                  type="button"
                >
                  <Send size={18} />
                  Resume session
                </button>
                <button className="macro-button coming-soon" disabled type="button" title="Waiting for Unreal/protocol contract">
                  <Send size={18} />
                  <span>Calibrate</span>
                  <small>coming next</small>
                </button>
              </div>
              <CommandRecipientsList clients={commandClients} />
              {commandClients.length === 0 && (
                <p className="muted-copy">No command recipients. Run npm run dev:demo or connect the real Unreal client to enable session commands.</p>
              )}
              {experienceRun.status === "not_started" && (
                <p className="muted-copy">Start the experience to enable analytic Pause, Resume and marker tracking.</p>
              )}
              {experienceRun.status === "ended" && (
                <p className="muted-copy">Experience ended locally. Start next experience to send more tracked commands.</p>
              )}
              {commandClients.length > 0 && sessionState.state === "paused" && (
                <p className="muted-copy">Session is paused. Resume is available; Pause stays locked until the stream reports running.</p>
              )}
            </Panel>
            <Panel className="marker-panel" title="Experience marker">
              <div className="form-block marker-form">
                <div className="preset-chip-row" aria-label="Quick marker presets">
                  <span>Presets</span>
                  {MARKER_PRESETS.map((preset) => (
                    <button
                      className={`preset-chip ${markerLabel.trim() === preset ? "active" : ""}`}
                      key={preset}
                      type="button"
                      onClick={() => setMarkerLabel(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <label htmlFor="marker-label">Marker label</label>
                <input
                  id="marker-label"
                  maxLength={80}
                  placeholder="stimulus-start"
                  value={markerLabel}
                  onChange={(event) => setMarkerLabel(event.target.value)}
                />
                <label htmlFor="marker-note">Marker note</label>
                <textarea
                  id="marker-note"
                  maxLength={240}
                  placeholder="optional note"
                  value={markerNote}
                  onChange={(event) => setMarkerNote(event.target.value)}
                />
                <button className="command-button" disabled={!canDispatchMarker} type="button" onClick={() => setConfirmingAction("add-marker")}>
                  <Send size={16} /> {isDispatching ? "Waiting for ACK" : "Add marker"}
                </button>
                <p className="muted-copy">Adds an operational marker to the active experience timeline without changing running or paused state.</p>
              </div>
            </Panel>
          </div>
        )}
        {activeTab === "timeline" && (
          <Panel
            className="timeline-panel session-tab-panel"
            title="Session timeline"
            action={<StatusPill tone={filteredTimeline.length > 0 ? "ok" : "muted"} label={`${filteredTimeline.length}/${timeline.length} visible`} />}
          >
            <SessionTimelineControls
              filteredCount={filteredTimeline.length}
              kind={timelineKind}
              options={timelineFilterOptions}
              query={timelineQuery}
              source={timelineSource}
              totalCount={timeline.length}
              onKindChange={setTimelineKind}
              onQueryChange={setTimelineQuery}
              onSourceChange={setTimelineSource}
            />
            <SessionTimeline
              filtersActive={timelineFiltersActive}
              hasUnrealClient={hasUnrealClient}
              runStatus={experienceRun.status}
              timeline={filteredTimeline}
              totalCount={timeline.length}
            />
          </Panel>
        )}
        {activeTab === "sensors" && (
          <Panel
            className="session-tab-panel"
            title="Live sensors"
            action={
              <div className="panel-actions">
                <StatusPill tone={sensorSummaries.length > 0 ? "ok" : "muted"} label={`${sensorSummaries.length} sensor${sensorSummaries.length === 1 ? "" : "s"}`} />
                <button className="mini-button strong" disabled={sensorSummaries.length === 0} type="button" onClick={onExportSensorDataJson}>
                  <Download size={14} /> Export JSON
                </button>
              </div>
            }
          >
            <SensorListPanel summaries={sensorSummaries} />
          </Panel>
        )}
        {activeTab === "history" && (
          <Panel
            className="event-panel command-history-panel session-tab-panel"
            title="Command history / ACK tracking"
            action={
              <div className="panel-actions">
                <StatusPill tone={latestAck ? "warn" : "muted"} label={latestAck ? "Hub pending" : "Clear"} />
                <button className="mini-button" disabled={commandHistory.length === 0} type="button" onClick={onClearHistory}>
                  Clear history
                </button>
              </div>
            }
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Sent</th>
                  <th>Duration</th>
                  <th>ACK client</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {commandHistory.map((item) => (
                  <tr className={commandRowClass(item.status)} key={item.messageId}>
                    <td className="mono">{item.messageId}</td>
                    <td>{item.action}</td>
                    <td>{item.target}</td>
                    <td className="mono">{formatTime(item.sentAt)}</td>
                    <td className="mono">{formatDuration(item.durationMs)}</td>
                    <td className="mono">{item.ackClientId ?? "--"}</td>
                    <td><StatusPill tone={commandStatusTone(item.status)} label={item.status} /></td>
                    <td>{commandObservedStateDetail(item, sessionState, events)}</td>
                  </tr>
                ))}
                {commandHistory.length === 0 && <EmptyRow columns={8} text="No dashboard commands sent in this browser session." />}
              </tbody>
            </table>
            {(status?.pendingAcks.length ?? 0) > 0 && (
              <div className="pending-ack-strip">
                <strong>Hub pending ACKs</strong>
                {(status?.pendingAcks ?? []).map((ack) => (
                  <span className="mono" key={`${ack.messageId}-${ack.recipientClientId}`}>
                    {ack.messageId} {"->"} {ack.recipientClientId}
                  </span>
                ))}
              </div>
            )}
          </Panel>
        )}
        {activeTab === "report" && experienceRun.status === "ended" && (
          <ExperienceReportPanel
            report={report}
            totalCount={timeline.length}
            timelineCsvDisabled={timeline.length === 0}
            onExportBiometrics={() => exportReportCsv("biometrics")}
            onExportBiometricsTimeline={() => exportReportCsv("biometrics-timeline")}
            onExportMarkers={() => exportReportCsv("markers")}
            onExportReport={exportReport}
            onExportTimeline={() => exportTimeline(timeline, "csv", "all")}
          />
        )}
      </section>
    {confirmingAction && (
      <CommandConfirmDialog
        action={confirmingAction}
        markerLabel={markerLabel.trim()}
        recipientCount={commandClients.length}
        onCancel={() => setConfirmingAction(null)}
        onConfirm={confirmCommand}
      />
    )}
    </>
  );
}

function ExperienceRunHeader({
  header,
  onEnd,
  onStart,
  onStartNext,
  run,
  sessionState,
  summary,
  wasRestored,
}: {
  header: RunHeaderSummary;
  onEnd: () => void;
  onStart: () => void;
  onStartNext: () => void;
  run: ExperienceRunState;
  sessionState: SessionStateSummary;
  summary: ExperienceRunSummary;
  wasRestored: boolean;
}) {
  const isActive = run.status === "running" || run.status === "paused";
  const isEnded = run.status === "ended";

  return (
    <section className={`experience-run-header ${run.status}`}>
      <div className="experience-run-title">
        <span>Experience</span>
        <strong>{header.experienceLabel}</strong>
        {wasRestored && <StatusPill tone="muted" label="Restored local experience" />}
        <div className="run-header-chip-row">
          <StatusPill tone={header.unrealTone} label={header.unrealLabel} />
          <StatusPill tone={header.sensorTone} label={header.sensorLabel} />
        </div>
      </div>
      <div className="experience-run-metrics">
        <Metric label="Experience time" value={formatExperienceTime(summary.experienceTimeMs)} />
        <Metric label="Paused time" value={formatExperienceTime(summary.pausedTimeMs)} small />
        <Metric label="Started at" value={run.startedAt ? formatDateTime(run.startedAt) : "--"} small />
        <Metric label="Markers" value={summary.markerCount} small />
        {isEnded && <Metric label="Ended at" value={run.endedAt ? formatDateTime(run.endedAt) : "--"} small />}
      </div>
      <div className="experience-run-observed">
        <span>{run.source ? `started by ${run.source === "xr" ? "XR" : "dashboard"}` : "no run source"}</span>
        {run.runId && <span className="mono">run {run.runId}</span>}
        {run.label && <span>{run.label}</span>}
        <span>{header.unrealDetail}</span>
        <span>{header.sensorDetail}</span>
        <span>last command {sessionState.lastCommandId ?? "--"}</span>
      </div>
      <div className="experience-run-actions">
        {run.status === "not_started" && (
          <button className="command-button strong" type="button" onClick={onStart}>
            Start experience
          </button>
        )}
        {isActive && (
          <button className="command-button danger" type="button" onClick={onEnd}>
            End experience
          </button>
        )}
        {isEnded && (
          <button className="command-button" type="button" onClick={onStartNext}>
            Start next experience
          </button>
        )}
      </div>
    </section>
  );
}

function SessionControlTabs({
  activeTab,
  commandCount,
  onTabChange,
  runStatus,
  sensorCount,
  timelineCount,
}: {
  activeTab: SessionControlTab;
  commandCount: number;
  onTabChange: (tab: SessionControlTab) => void;
  runStatus: ExperienceRunState["status"];
  sensorCount: number;
  timelineCount: number;
}) {
  const tabs = buildSessionControlTabs(runStatus, timelineCount, sensorCount, commandCount);

  return (
    <div className="session-control-tabs" role="tablist" aria-label="Session control views">
      {tabs.map((tab) => (
        <button
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "active" : ""}
          key={tab.id}
          role="tab"
          type="button"
          onClick={() => onTabChange(tab.id)}
        >
          <span>{tab.label}</span>
          {typeof tab.count === "number" && <strong>{tab.count}</strong>}
        </button>
      ))}
    </div>
  );
}

function SensorListPanel({ summaries }: { summaries: SensorTelemetrySummary[] }) {
  const rows = buildSensorListRows(summaries);

  if (rows.length === 0) {
    return <p className="empty-state">No sensor telemetry observed. Connect a WebSocket sensor or HRV publisher to populate this list.</p>;
  }

  return (
    <table className="data-table sensor-list-table">
      <thead>
        <tr>
          <th>Sensor</th>
          <th>Signal</th>
          <th>BPM</th>
          <th>RR ms</th>
          <th>IBI samples</th>
          <th>Samples/min</th>
          <th>Last update</th>
          <th>Topic</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <strong>{row.name}</strong>
              <span className="subtle-line mono">{row.id}</span>
            </td>
            <td><StatusPill tone={sensorSignalTone(row.signalState)} label={row.signalLabel} /></td>
            <td className="mono">{row.bpm}</td>
            <td className="mono">{row.rrMs}</td>
            <td className="mono">{row.ibiSampleCount}</td>
            <td className="mono">{row.samplesPerMinute}</td>
            <td className="mono">{row.lastUpdate}</td>
            <td className="mono">{row.topic}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExperienceReportPanel({
  onExportBiometrics,
  onExportBiometricsTimeline,
  onExportMarkers,
  onExportReport,
  onExportTimeline,
  report,
  totalCount,
  timelineCsvDisabled,
}: {
  onExportBiometrics: () => void;
  onExportBiometricsTimeline: () => void;
  onExportMarkers: () => void;
  onExportReport: (format: "json" | "csv") => void;
  onExportTimeline: () => void;
  report: ExperienceReport;
  totalCount: number;
  timelineCsvDisabled: boolean;
}) {
  const issueCount = commandIssueCount(report.commands);
  const reportHealth = deriveExperienceReportHealth(report);
  const [selectedSensorId, setSelectedSensorId] = useState(() => report.analytics.sensors[0]?.sensorClientId ?? "");
  const selectedSensor =
    report.analytics.sensors.find((sensor) => sensor.sensorClientId === selectedSensorId) ?? report.analytics.sensors[0];

  useEffect(() => {
    if (!selectedSensorId || !report.analytics.sensors.some((sensor) => sensor.sensorClientId === selectedSensorId)) {
      setSelectedSensorId(report.analytics.sensors[0]?.sensorClientId ?? "");
    }
  }, [report.analytics.sensors, selectedSensorId]);

  return (
    <div className="session-tab-panel report-grid">
      <Panel className="report-wide report-summary-panel" title="Session report">
        <ReportHealthStrip health={reportHealth} />
        <div className="report-summary-hero">
          <div className="report-duration-block">
            <span>Experience duration</span>
            <strong>{formatExperienceTime(report.summary.durationMs)}</strong>
          </div>
          <dl className="report-time-list">
            <div>
              <dt>Started</dt>
              <dd>{report.summary.startedAt ? formatDateTime(report.summary.startedAt) : "--"}</dd>
            </div>
            <div>
              <dt>Ended</dt>
              <dd>{report.summary.endedAt ? formatDateTime(report.summary.endedAt) : "--"}</dd>
            </div>
            <div>
              <dt>Paused</dt>
              <dd>{formatExperienceTime(report.summary.pausedMs)}</dd>
            </div>
          </dl>
        </div>
        <div className="report-chip-row">
          <ReportChip label="Markers" value={report.summary.markerCount} />
          <ReportChip label="State changes" value={report.summary.stateChangeCount} />
          <ReportChip label="Biometric notes" value={report.summary.biometricObservationCount} />
          <ReportChip
            label="Commands"
            value={report.commands.total}
            detail={issueCount > 0 ? `${issueCount} issue${issueCount === 1 ? "" : "s"}` : `${report.commands.accepted} accepted`}
            tone={issueCount > 0 ? "warn" : "ok"}
          />
        </div>
        <div className="report-export-bar">
          <div>
            <span>Recommended exports</span>
            <button className="mini-button strong" type="button" onClick={() => onExportReport("json")}>
              <Download size={14} /> Report JSON
            </button>
            <button className="mini-button strong" disabled={report.markers.length === 0} type="button" onClick={onExportMarkers}>
              <Download size={14} /> Markers CSV
            </button>
          </div>
          <div>
            <span>Advanced</span>
            <button className="mini-button" disabled={report.biometrics.length === 0} type="button" onClick={onExportBiometrics}>
              <Download size={14} /> Biometrics CSV
            </button>
            <button
              className="mini-button"
              disabled={report.analytics.sensors.every((sensor) => sensor.samples.length === 0)}
              type="button"
              onClick={onExportBiometricsTimeline}
            >
              <Download size={14} /> Biometrics Timeline CSV
            </button>
            <button className="mini-button" disabled={timelineCsvDisabled} type="button" onClick={onExportTimeline}>
              <Download size={14} /> Timeline CSV ({totalCount})
            </button>
          </div>
        </div>
      </Panel>

      <Panel
        className="report-wide biometric-chart-panel"
        title="Biometric timeline"
        action={
          <StatusPill
            tone={selectedSensor && selectedSensor.samples.length > 0 ? "ok" : "muted"}
            label={selectedSensor ? `${selectedSensor.samples.length} samples` : "No samples"}
          />
        }
      >
        <BiometricTimelineChart
          analytics={report.analytics}
          durationMs={report.summary.durationMs}
          sensors={report.analytics.sensors}
          selectedSensorId={selectedSensorId}
          onSelectSensor={setSelectedSensorId}
        />
      </Panel>

      <Panel className="report-wide" title="Biometrics summary">
        {report.biometrics.length === 0 ? (
          <p className="empty-state">No biometric samples captured.</p>
        ) : (
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>Sensor</th>
                <th>Samples</th>
                <th>BPM min/avg/max</th>
                <th>RR avg</th>
                <th>IBI total</th>
                <th>Poor</th>
                <th>Gaps</th>
                <th>Window</th>
              </tr>
            </thead>
            <tbody>
              {report.biometrics.map((sensor) => (
                <tr key={sensor.sensorClientId}>
                  <td className="mono">{sensor.sensorClientId}</td>
                  <td>{sensor.sampleCount}</td>
                  <td className="mono">{formatBpmRange(sensor.bpmMin, sensor.bpmAvg, sensor.bpmMax)}</td>
                  <td className="mono">{formatReportMs(sensor.rrAvgMs)}</td>
                  <td>{sensor.ibiSampleCount}</td>
                  <td>{sensor.poorObservationCount}</td>
                  <td>{sensor.gapObservationCount}</td>
                  <td>
                    <span className="subtle-line">{sensor.firstSampleAt ? formatTime(sensor.firstSampleAt) : "--"}</span>
                    <span className="subtle-line">{sensor.lastSampleAt ? formatTime(sensor.lastSampleAt) : "--"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel className="report-wide" title="Marker snapshots">
        {report.markers.length === 0 ? (
          <p className="empty-state">No markers captured in this experience.</p>
        ) : (
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>Experience time</th>
                <th>Label</th>
                <th>Source</th>
                <th>BPM</th>
                <th>RR</th>
                <th>Signal</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {report.markers.map((marker) => (
                <tr key={marker.id}>
                  <td className="mono">{formatExperienceTime(marker.experienceTimeMs)}</td>
                  <td>{marker.label}</td>
                  <td className="mono">{marker.source ?? marker.sourceClientId}</td>
                  <td className="mono">{formatReportNumber(marker.bpm)}</td>
                  <td className="mono">{formatReportMs(marker.rrMs)}</td>
                  <td>{marker.sensorSignal ?? "--"}</td>
                  <td>{marker.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {issueCount > 0 && (
        <Panel className="report-wide" title="Command issues">
          <div className="report-command-line">
            <span>{report.commands.total} total</span>
            <span>{report.commands.accepted} accepted</span>
            <span>{report.commands.rejected} rejected</span>
            <span>{report.commands.timeout} timeout</span>
            <span>{report.commands.failed} failed</span>
            <span>{report.commands.pending} pending</span>
          </div>
        </Panel>
      )}
    </div>
  );
}

function ReportHealthStrip({ health }: { health: ExperienceReportHealth }) {
  return (
    <div className={`report-health-strip ${health.tone}`}>
      <div className="report-health-main">
        <StatusPill tone={health.tone === "error" ? "error" : health.tone === "ok" ? "ok" : health.tone === "warn" ? "warn" : "muted"} label={health.label} />
        <span>{health.details.join(" ")}</span>
      </div>
      <div className="report-health-metrics">
        <ReportHealthMetric label="Samples" value={health.metrics.biometricSampleCount} />
        <ReportHealthMetric label="BPM min/avg/max" value={formatBpmRange(health.metrics.bpmMin, health.metrics.bpmAvg, health.metrics.bpmMax)} />
        <ReportHealthMetric label="RR avg" value={formatReportMs(health.metrics.rrAvgMs)} />
        <ReportHealthMetric label="Markers" value={health.metrics.markerCount} />
        <ReportHealthMetric label="Gaps / poor" value={`${health.metrics.sensorGapCount} / ${health.metrics.poorSignalCount}`} />
        <ReportHealthMetric label="Command issues" value={health.metrics.commandIssueCount} />
      </div>
    </div>
  );
}

function ReportHealthMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="report-health-metric">
      <em>{label}</em>
      <strong>{value}</strong>
    </span>
  );
}

function BiometricTimelineChart({
  durationMs,
  onSelectSensor,
  selectedSensorId,
  sensors,
  analytics,
}: {
  analytics: ExperienceReport["analytics"];
  durationMs: number;
  onSelectSensor: (sensorId: string) => void;
  selectedSensorId: string;
  sensors: SensorAnalyticsSeries[];
}) {
  const chart = buildBiometricChartModel({ analytics, durationMs, sensorId: selectedSensorId });
  const samples = chart.selectedSensor?.samples ?? [];
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [pinnedGroupId, setPinnedGroupId] = useState<string | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [pinnedMarkerId, setPinnedMarkerId] = useState<string | null>(null);
  const activeGroupId = hoveredGroupId ?? pinnedGroupId;
  const activeGroup = chart.markerGroups.find((group) => group.id === activeGroupId) ?? null;
  const activeExpansion = activeGroup ? markerGroupExpansionLayout(activeGroup) : null;
  const activeMarkerId = hoveredMarkerId ?? pinnedMarkerId;
  const activeExpansionItem = activeExpansion?.items.find((item) => item.markerId === activeMarkerId) ?? null;
  const activePopoverGroup = activeExpansionItem
    ? expansionItemPopoverGroup(activeGroup!, activeExpansionItem)
    : activeGroup && !activeGroup.isCluster
      ? activeGroup
      : null;

  const clearHoverRail = () => {
    setHoveredGroupId(null);
    setHoveredMarkerId(null);
  };

  const clearPinnedRail = () => {
    setPinnedGroupId(null);
    setPinnedMarkerId(null);
  };

  const activateGroup = (groupId: string) => {
    setHoveredGroupId(groupId);
    setHoveredMarkerId(null);
  };

  const toggleGroupPin = (group: BiometricChartMarkerGroup) => {
    const isSameGroupPinned = pinnedGroupId === group.id && pinnedMarkerId === null;
    setPinnedGroupId(isSameGroupPinned ? null : group.id);
    setPinnedMarkerId(null);
  };

  const activateMarker = (groupId: string, markerId: string) => {
    setHoveredGroupId(groupId);
    setHoveredMarkerId(markerId);
  };

  const toggleMarkerPin = (groupId: string, markerId: string) => {
    const isSameMarkerPinned = pinnedGroupId === groupId && pinnedMarkerId === markerId;
    setPinnedGroupId(isSameMarkerPinned ? null : groupId);
    setPinnedMarkerId(isSameMarkerPinned ? null : markerId);
  };

  return (
    <div className="biometric-chart-shell">
      <div className="biometric-chart-toolbar">
        <div className="chart-legend">
          <span className="legend-item bpm">BPM</span>
          <span className="legend-item rr">RR ms</span>
          <span className="legend-item marker">Markers</span>
          <span className="legend-item pause">Paused</span>
        </div>
        <span className="chart-note">Aggregated trend view; exports keep raw samples</span>
        {sensors.length > 1 && (
          <label>
            Sensor
            <select value={selectedSensorId} onChange={(event) => onSelectSensor(event.target.value)}>
              {sensors.map((sensor) => (
                <option key={sensor.sensorClientId} value={sensor.sensorClientId}>
                  {sensor.sensorClientId}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!chart.selectedSensor || samples.length === 0 ? (
        <p className="empty-state">No biometric samples captured.</p>
      ) : (
        <>
          <svg
            className="biometric-chart"
            role="img"
            viewBox="0 0 760 330"
            aria-label="Biometric timeline chart"
            onClick={clearPinnedRail}
          >
            {chart.lanes.map((lane) => (
              <ChartLane lane={lane} key={lane.id} />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <g key={tick}>
                <line className="chart-grid-line" x1={54 + tick * 644} x2={54 + tick * 644} y1="24" y2="226" />
                <text className="chart-axis-label" x={54 + tick * 644} y="316" textAnchor="middle">
                  {formatExperienceTime(chart.maxTimeMs * tick)}
                </text>
              </g>
            ))}
            {chart.pauseMarkers.map((pause) => (
              <g className="chart-pause-marker" key={`${pause.realStartedAt}-${pause.realEndedAt ?? "open"}`}>
                <line x1={pause.x} x2={pause.x} y1="24" y2="226" />
                <text x={pause.x + 5} y="22">pause</text>
                <title>{`Paused at ${formatExperienceTime(pause.startExperienceTimeMs)} (${formatTime(pause.realStartedAt)} - ${pause.realEndedAt ? formatTime(pause.realEndedAt) : "open"})`}</title>
              </g>
            ))}
            {chart.markerGroups.map((group) => (
              <g
                className={`chart-marker-rail-entry ${activeGroup?.id === group.id ? "active" : ""}`}
                key={group.id}
                onMouseEnter={() => activateGroup(group.id)}
                onMouseLeave={clearHoverRail}
              >
                <g
                  aria-label={markerGroupTooltip(group)}
                  className={`chart-marker-group ${group.isCluster ? "cluster" : "single"} ${activeGroup?.id === group.id ? "active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      clearHoverRail();
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleGroupPin(group);
                  }}
                  onFocus={() => activateGroup(group.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleGroupPin(group);
                    }
                    if (event.key === "Escape") {
                      clearPinnedRail();
                      clearHoverRail();
                    }
                  }}
                >
                  <line x1={group.x} x2={group.x} y1="222" y2={group.labelY + 8} />
                  <circle cx={group.x} cy="224" r={group.isCluster ? "4" : "3"} />
                  <rect x={group.labelX} y={group.labelY} width={group.labelWidth} height="16" rx="2" />
                  <text x={group.labelX + group.labelWidth / 2} y={group.labelY + 11} textAnchor="middle">
                    {group.displayLabel}
                  </text>
                </g>
                {activeGroup?.id === group.id && activeExpansion && (
                  <g className="chart-marker-expansion">
                    <rect x={activeExpansion.x} y={activeExpansion.y} width={activeExpansion.width} height={activeExpansion.height} rx="3" />
                    {activeExpansion.items.map((item) => (
                      <g
                        aria-label={markerGroupTooltip(expansionItemPopoverGroup(group, item))}
                        className={`chart-marker-expansion-item ${activeMarkerId === item.markerId ? "active" : ""}`}
                        key={item.markerId}
                        role="button"
                        tabIndex={0}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setHoveredMarkerId((current) => (current === item.markerId ? null : current));
                          }
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleMarkerPin(group.id, item.markerId);
                        }}
                        onFocus={() => activateMarker(group.id, item.markerId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleMarkerPin(group.id, item.markerId);
                          }
                          if (event.key === "Escape") {
                            clearPinnedRail();
                            clearHoverRail();
                          }
                        }}
                        onMouseEnter={() => activateMarker(group.id, item.markerId)}
                        onMouseLeave={() => setHoveredMarkerId((current) => (current === item.markerId ? null : current))}
                      >
                        <rect x={item.x} y={item.y} width={item.width} height={16} rx="2" />
                        <text x={item.x + item.width / 2} y={item.y + 11} textAnchor="middle">
                          {item.label}
                        </text>
                      </g>
                    ))}
                  </g>
                )}
              </g>
            ))}
            {activePopoverGroup && <MarkerGroupPopover group={activePopoverGroup} />}
          </svg>
          {chart.markerGroups.length > 0 && <MarkerCallouts groups={chart.markerGroups} />}
          <div className="biometric-chart-stats">
            <span className="mono">{chart.selectedSensor.sensorClientId}</span>
            <span>{chart.lanes[0].isAggregated ? `${chart.lanes[0].points.length}/${chart.lanes[0].rawPointCount} shown` : `${chart.lanes[0].rawPointCount} samples`}</span>
            <span>BPM {formatBpmRange(chart.selectedSensor.stats.bpmMin, chart.selectedSensor.stats.bpmAvg, chart.selectedSensor.stats.bpmMax)}</span>
            <span>RR avg {formatReportMs(chart.selectedSensor.stats.rrAvgMs)}</span>
            <span>{chart.selectedSensor.stats.poorSignalCount} poor</span>
            <span>{chart.selectedSensor.stats.gapCount} gaps</span>
          </div>
        </>
      )}
    </div>
  );
}

function expansionItemPopoverGroup(group: BiometricChartMarkerGroup, item: MarkerGroupExpansionItem): BiometricChartMarkerGroup {
  return {
    id: `${group.id}:${item.markerId}`,
    x: item.x + item.width / 2,
    labelX: item.x,
    labelY: item.y,
    labelWidth: 0,
    displayLabel: item.label,
    markers: [item.marker],
    isCluster: false,
  };
}

function MarkerGroupPopover({ group }: { group: BiometricChartMarkerGroup }) {
  const layout = markerGroupPopoverLayout(group);
  const visibleMarkers = group.markers.slice(0, 4);
  const overflowCount = group.markers.length - visibleMarkers.length;
  return (
    <g className="chart-marker-popover" pointerEvents="none">
      <line x1={layout.anchorX} x2={layout.anchorX} y1={layout.anchorY} y2={layout.y + layout.height} />
      <rect x={layout.x} y={layout.y} width={layout.width} height={layout.height} rx="3" />
      <text className="chart-marker-popover-title" x={layout.x + 10} y={layout.y + 16}>
        {group.isCluster ? group.displayLabel : "Marker"}
      </text>
      {visibleMarkers.map((marker, index) => (
        <g className="chart-marker-popover-item" key={marker.markerId} transform={`translate(${layout.x + 10} ${layout.y + 34 + index * 36})`}>
          <text className="chart-marker-popover-meta" x="0" y="0">
            {formatExperienceTime(marker.experienceTimeMs)}
          </text>
          <text className="chart-marker-popover-label" x="0" y="14">
            {shortPopoverText(marker.label, 48)}
          </text>
          <text className="chart-marker-popover-summary" x="0" y="28">
            {shortPopoverText(markerBiometricSummary(marker), 58)}
          </text>
        </g>
      ))}
      {overflowCount > 0 && (
        <text className="chart-marker-popover-overflow" x={layout.x + 10} y={layout.y + 34 + visibleMarkers.length * 36}>
          +{overflowCount} more markers in callouts
        </text>
      )}
    </g>
  );
}

function MarkerCallouts({ groups }: { groups: BiometricChartMarkerGroup[] }) {
  const markerCount = groups.reduce((total, group) => total + group.markers.length, 0);
  return (
    <div className="marker-callouts">
      <div className="marker-callouts-header">
        <span>Marker callouts</span>
        <span>
          {markerCount} markers / {groups.length} rail groups
        </span>
      </div>
      <div className="marker-callout-list">
        {groups.map((group, groupIndex) => (
          <div className="marker-callout-group" key={group.id}>
            <div className="marker-callout-group-title">
              <span>{group.isCluster ? group.displayLabel : `Marker ${groupIndex + 1}`}</span>
              <span>{markerGroupTimeRange(group)}</span>
            </div>
            {group.markers.map((marker) => (
              <div className="marker-callout-row" key={marker.markerId}>
                <span className="mono">{formatExperienceTime(marker.experienceTimeMs)}</span>
                <strong>{marker.label}</strong>
                <span className="mono">{marker.source ?? "source --"}</span>
                <span>{markerBiometricSummary(marker)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartLane({ lane }: { lane: BiometricChartLane }) {
  return (
    <g className={`chart-lane ${lane.id}`}>
      <rect className="chart-frame" x={lane.plot.x} y={lane.plot.y} width={lane.plot.width} height={lane.plot.height} />
      <line className="chart-grid-line horizontal" x1={lane.plot.x} x2={lane.plot.x + lane.plot.width} y1={lane.plot.y + lane.plot.height / 2} y2={lane.plot.y + lane.plot.height / 2} />
      <text className="chart-axis-label lane-title" x={lane.labelPosition.x} y={lane.labelPosition.y}>{lane.label}</text>
      <text className="chart-axis-label" x={lane.plot.x - 8} y={lane.plot.y + 10} textAnchor="end">{formatReportNumber(lane.domain[1])}</text>
      <text className="chart-axis-label" x={lane.plot.x - 8} y={lane.plot.y + lane.plot.height} textAnchor="end">{formatReportNumber(lane.domain[0])}</text>
      {lane.segments.map((segment) => (
        <path className={`chart-step-segment ${lane.id} ${segment.tone}`} d={segment.path} key={segment.key} />
      ))}
      {lane.points
        .filter((point) => lane.showDots || point.signal === "poor" || point.phase === "paused")
        .map((point) => (
          <circle className={`chart-dot ${lane.id} signal-${point.signal} phase-${point.phase}`} cx={point.x} cy={point.y} key={point.key} r="3.4">
            <title>{`${lane.label} ${formatReportNumber(point.value)} ${lane.unit} at ${formatExperienceTime(point.experienceTimeMs)}`}</title>
          </circle>
        ))}
    </g>
  );
}

function ReportChip({
  detail,
  label,
  tone = "muted",
  value,
}: {
  detail?: string;
  label: string;
  tone?: "ok" | "warn" | "muted";
  value: number;
}) {
  return (
    <div className={`report-chip ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <em>{detail}</em>}
    </div>
  );
}

function CommandConfirmDialog({
  action,
  markerLabel,
  onCancel,
  onConfirm,
  recipientCount,
}: {
  action: UnrealCommandAction;
  markerLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  recipientCount: number;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const title = commandDialogTitle(action);
  const detail =
    action === "add-marker"
      ? `Marker "${markerLabel}" will be published to the session timeline after ACK.`
      : `${title} will be published to Unreal and must return ACK.`;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="command-confirm-title">
        <header>
          <span>Confirm command</span>
          <strong id="command-confirm-title">{title}</strong>
        </header>
        <p>{detail}</p>
        <dl>
          <dt>Topic</dt>
          <dd className="mono">unreal.commands</dd>
          <dt>Recipients</dt>
          <dd>{recipientCount}</dd>
          <dt>ACK</dt>
          <dd>required</dd>
        </dl>
        <div className="confirm-dialog-actions">
          <button className="mini-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="mini-button strong" type="button" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </section>
    </div>
  );
}

function SessionTimelineControls({
  filteredCount,
  kind,
  onKindChange,
  onQueryChange,
  onSourceChange,
  options,
  query,
  source,
  totalCount,
}: {
  filteredCount: number;
  kind: TimelineKindFilter;
  onKindChange: (kind: TimelineKindFilter) => void;
  onQueryChange: (query: string) => void;
  onSourceChange: (source: string) => void;
  options: ReturnType<typeof deriveTimelineFilterOptions>;
  query: string;
  source: string;
  totalCount: number;
}) {
  const sourceOptions = source === "all" || options.sources.includes(source) ? options.sources : [source, ...options.sources];
  const kindOptions = kind === "all" || options.kinds.includes(kind) ? options.kinds : [kind, ...options.kinds];

  return (
    <div className="timeline-toolbar">
      <div className="timeline-filter-grid">
        <label htmlFor="timeline-query">
          Search
          <input
            id="timeline-query"
            placeholder="label, note, client, detail"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <label htmlFor="timeline-source">
          Source
          <select id="timeline-source" value={source} onChange={(event) => onSourceChange(event.target.value)}>
            <option value="all">all sources</option>
            {sourceOptions.map((sourceOption) => (
              <option key={sourceOption} value={sourceOption}>
                {sourceOption}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="timeline-kind">
          Type
          <select id="timeline-kind" value={kind} onChange={(event) => onKindChange(event.target.value as TimelineKindFilter)}>
            <option value="all">marker + state</option>
            {kindOptions.map((kindOption) => (
              <option key={kindOption} value={kindOption}>
                {kindOption}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="timeline-export-row">
        <span className="mono">
          visible {filteredCount} / all {totalCount}
        </span>
        <span>Exports unlock after End experience.</span>
      </div>
    </div>
  );
}

function SessionTimeline({
  filtersActive,
  hasUnrealClient,
  runStatus,
  timeline,
  totalCount,
}: {
  filtersActive: boolean;
  hasUnrealClient: boolean;
  runStatus: ExperienceRunState["status"];
  timeline: AnalyticSessionTimelineItem[];
  totalCount: number;
}) {
  if (timeline.length === 0) {
    if (filtersActive && totalCount > 0) {
      return <p className="empty-state timeline-empty">No timeline items match the current filters.</p>;
    }
    if (runStatus === "not_started") {
      return <p className="empty-state timeline-empty">Start the experience to begin the analytic timeline.</p>;
    }
    if (runStatus === "ended") {
      return <p className="empty-state timeline-empty">Experience ended without captured state changes or markers.</p>;
    }
    if (!hasUnrealClient) {
      return <p className="empty-state timeline-empty">No Unreal client connected. Connect Unreal or run npm run dev:demo to capture state and markers.</p>;
    }
    return <p className="empty-state timeline-empty">Waiting for experience.lifecycle, unreal.state or experience.marker events from this browser session.</p>;
  }

  return (
    <div className="timeline-list">
      {timeline.map((item) => (
        <article className={`timeline-item ${item.kind} ${item.tone} phase-${item.phase}`} key={item.id}>
          <div className="timeline-rail">
            <span className="timeline-time mono">{formatExperienceTime(item.experienceTimeMs)}</span>
            <span className="timeline-dot" />
            <span className="timeline-kind">{item.kind}</span>
          </div>
          <div className="timeline-copy">
            <div className="timeline-title-row">
              <strong>{item.title}</strong>
              <span className="mono">{formatDateTime(item.realReceivedAt)}</span>
            </div>
            <p>{item.detail}</p>
            <div className="timeline-meta">
              <span className={`phase-pill ${item.phase}`}>{item.phase}</span>
              <span className="mono">source {item.source ?? item.sourceClientId}</span>
              {item.source && item.source !== item.sourceClientId && <span className="mono">client {item.sourceClientId}</span>}
              <span className="mono">hub t+{formatSessionMs(item.sessionTimeMs)}</span>
              {item.commandId && <span className="mono">command {item.commandId}</span>}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function CommandRecipientsList({ clients }: { clients: HubClient[] }) {
  return (
    <div className="recipient-list">
      <div className="recipient-list-title">Will dispatch to</div>
      {clients.length > 0 ? (
        clients.map((client) => (
          <article className="recipient-item" key={client.clientId}>
            <div>
              <strong className="mono">{client.clientId}</strong>
              <span>{client.capabilities.join(", ") || "no capabilities"}</span>
            </div>
            <StatusPill tone="muted" label={client.role} />
            <span className={client.outboxSize > 0 ? "warn-icon mono" : "mono"}>outbox {client.outboxSize}</span>
          </article>
        ))
      ) : (
        <p className="muted-copy">No clients are subscribed to unreal.commands.</p>
      )}
    </div>
  );
}

function ClientsView(props: {
  clientFilter: string;
  clients: HubClient[];
  sensorSummaries: SensorTelemetrySummary[];
  selectedClient: HubClient | null;
  setClientFilter: (value: string) => void;
  setSelectedClientId: (value: string) => void;
  status: StatusResponse | null;
}) {
  const roles = ["all", "unreal", "sensor", "logger", "dashboard", "controller", "ai", "system"];
  const selectedSensorSummary = props.selectedClient ? sensorSummaryForClient(props.sensorSummaries, props.selectedClient.clientId) : null;
  return (
    <section className="clients-layout">
      <div className="client-main">
        <div className="table-toolbar">
          <strong>Connected clients matrix</strong>
          <span className="counter">Total: {props.status?.clientCount ?? props.clients.length}</span>
          <div className="role-tabs">
            {roles.map((role) => (
              <button
                className={props.clientFilter === role ? "active" : ""}
                key={role}
                onClick={() => props.setClientFilter(role)}
                type="button"
              >
                {role}
              </button>
            ))}
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>STS</th>
              <th>Client ID</th>
              <th>Role</th>
              <th>Capabilities</th>
              <th>Signal</th>
              <th>Subs</th>
              <th>Outbox</th>
            </tr>
          </thead>
          <tbody>
            {props.clients.map((client) => {
              const sensorSummary = sensorSummaryForClient(props.sensorSummaries, client.clientId);
              return (
                <tr
                  className={props.selectedClient?.clientId === client.clientId ? "selected" : ""}
                  key={client.clientId}
                  onClick={() => props.setSelectedClientId(client.clientId)}
                >
                  <td><span className={`status-dot ${client.outboxSize > 20 ? "warn" : "ok"}`} /></td>
                  <td className="mono">{client.clientId}</td>
                  <td><StatusPill tone="muted" label={client.role} /></td>
                  <td>{client.capabilities.join(", ") || "--"}</td>
                  <td>
                    {client.role === "sensor" ? (
                      <StatusPill
                        tone={sensorSignalTone(sensorSummary?.signalState ?? "unknown")}
                        label={sensorSignalLabel(sensorSummary?.signalState ?? "unknown")}
                      />
                    ) : (
                      "--"
                    )}
                  </td>
                  <td>{client.subscriptions.length}</td>
                  <td className={client.outboxSize > 20 ? "danger-text" : ""}>{client.outboxSize}</td>
                </tr>
              );
            })}
            {props.clients.length === 0 && <EmptyRow columns={7} text="No clients connected." />}
          </tbody>
        </table>
      </div>
      <Panel className="client-detail" title={props.selectedClient?.role ? `${props.selectedClient.role} module` : "Client detail"}>
        {props.selectedClient ? (
          <>
            <p className="mono large">{props.selectedClient.clientId}</p>
            <Metric label="Capabilities" value={props.selectedClient.capabilities.length} />
            <Metric label="Subscriptions" value={props.selectedClient.subscriptions.length} />
            <Metric label="Outbox" value={props.selectedClient.outboxSize} />
            {props.selectedClient.role === "sensor" && (
              <SensorClientDetail client={props.selectedClient} summary={selectedSensorSummary} />
            )}
            <pre className="payload-box">{JSON.stringify(props.selectedClient.subscriptions, null, 2)}</pre>
          </>
        ) : (
          <p className="muted-copy">Select a client to inspect subscriptions.</p>
        )}
      </Panel>
    </section>
  );
}

function TopicsView(props: {
  events: StreamEvent[];
  socketState: SocketState;
  topicFilter: string;
  setTopicFilter: (value: string) => void;
}) {
  const selected = props.events[0] ?? null;
  return (
    <section className="topics-layout">
      <div className="topic-stream">
        <div className="table-toolbar">
          <strong><Search size={16} /> Stream filters</strong>
          <input
            placeholder="Topic, client, or type"
            value={props.topicFilter}
            onChange={(event) => props.setTopicFilter(event.target.value)}
          />
          <StatusPill tone={props.socketState === "connected" ? "ok" : props.socketState === "connecting" ? "warn" : "error"} label={props.socketState} />
        </div>
        <EventTable events={props.events} />
      </div>
      <Panel className="payload-panel" title="Payload inspector">
        {selected ? (
          <>
            <dl className="detail-list">
              <dt>Topic</dt>
              <dd>{selected.envelope.topic ?? "--"}</dd>
              <dt>Client ID</dt>
              <dd>{selected.envelope.clientId}</dd>
              <dt>Type</dt>
              <dd>{selected.envelope.type}</dd>
            </dl>
            <pre className="payload-box">{JSON.stringify(selected.envelope.payload ?? {}, null, 2)}</pre>
          </>
        ) : (
          <p className="muted-copy">Open simulators or clients to populate the stream.</p>
        )}
      </Panel>
    </section>
  );
}

function DiagnosticsView(props: {
  endpoint: string;
  health: HealthResponse | null;
  lastError: string | null;
  normalizedEndpoint: string;
  setEndpoint: (value: string) => void;
  setToken: (value: string) => void;
  socketState: SocketState;
  status: StatusResponse | null;
  token: string;
}) {
  return (
    <section className="content-grid diagnostics-grid">
      <Panel title="System health / telemetry" action={<StatusPill tone={props.health?.ok ? "ok" : "error"} label={props.health?.ok ? "Status OK" : "Offline"} />}>
        <table className="data-table">
          <tbody>
            <KeyValue label="/health.status" value={props.health?.ok ? "ok" : "offline"} />
            <KeyValue label="/status.service" value={props.health?.service ?? "--"} />
            <KeyValue label="sessionId" value={props.health?.sessionId ?? "--"} />
            <KeyValue label="pendingAckCount" value={String(props.status?.pendingAckCount ?? props.health?.pendingAcks ?? 0)} />
            <KeyValue label="websocket" value={props.socketState} />
          </tbody>
        </table>
        {props.lastError && <p className="alert-line inline">{props.lastError}</p>}
      </Panel>
      <Panel title="Network config">
        <label className="field-label">Local endpoint</label>
        <input value={props.endpoint} onChange={(event) => props.setEndpoint(event.target.value)} />
        <label className="field-label">Auth token</label>
        <input
          type="password"
          placeholder="optional"
          value={props.token}
          onChange={(event) => props.setToken(event.target.value)}
        />
        <p className="muted-copy">WebSocket endpoint: {toWsPreview(props.normalizedEndpoint)}</p>
      </Panel>
      <Panel title="Client integration guidance">
        <ol className="steps">
          <li>Run .\\.venv\\Scripts\\biofeedback-hub.</li>
          <li>Set Quest Supervisor endpoint to this machine and port 8787.</li>
          <li>Start Unreal/Quest or a simulator and verify it appears in Clients.</li>
          <li>Use Topics to confirm state and sensor publications.</li>
        </ol>
      </Panel>
      <Panel title="Storage & exports">
        <Metric label="Session log root" value="data/sessions" small />
        <Metric label="Known topics" value={TOPICS.length} />
        <button className="command-button disabled" type="button" disabled>
          <Database size={16} /> Export system info
        </button>
      </Panel>
    </section>
  );
}

function EventTable({ events }: { events: StreamEvent[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Topic</th>
          <th>Type</th>
          <th>Client ID</th>
          <th>Message</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => {
          const severity = eventSeverity(event);
          return (
            <tr className={severity === "error" ? "error-row" : severity === "warn" ? "warn-row" : ""} key={`${event.receivedAt}-${event.envelope.id ?? Math.random()}`}>
              <td className="mono">{formatTime(event.receivedAt)}</td>
              <td className="mono">{event.envelope.topic ?? "--"}</td>
              <td><StatusPill tone={severity === "error" ? "error" : severity === "warn" ? "warn" : "muted"} label={event.envelope.type} /></td>
              <td className="mono">{event.envelope.clientId}</td>
              <td>{summarizePayload(event.envelope.payload)}</td>
              <td>{severity.toUpperCase()}</td>
            </tr>
          );
        })}
        {events.length === 0 && <EmptyRow columns={6} text="No live events captured in this browser session." />}
      </tbody>
    </table>
  );
}

function OverviewEventList({ events }: { events: StreamEvent[] }) {
  if (events.length === 0) {
    return <p className="empty-state">No live events captured in this browser session.</p>;
  }

  return (
    <div className="overview-event-list">
      {events.map((event) => {
        const severity = eventSeverity(event);
        return (
          <article className={`overview-event ${severity}`} key={`${event.receivedAt}-${event.envelope.id ?? event.envelope.clientId}`}>
            <div className="overview-event-meta">
              <span className="mono">{formatTime(event.receivedAt)}</span>
              <StatusPill tone={severity === "error" ? "error" : severity === "warn" ? "warn" : "muted"} label={event.envelope.type} />
            </div>
            <div className="overview-event-body">
              <strong>{event.envelope.topic ?? event.envelope.clientId}</strong>
              <span>{summarizePayload(event.envelope.payload)}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Panel({ action, children, className = "", title }: { action?: React.ReactNode; children: React.ReactNode; className?: string; title: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <span>{title}</span>
        {action}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Metric({ label, small, value }: { label: string; small?: boolean; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={small ? "small" : ""}>{value}</strong>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="mono">{label}</td>
      <td>{value}</td>
    </tr>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "ok" | "warn" | "error" | "muted" }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function IconButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="icon-button" onClick={onClick} title={label} type="button" aria-label={label}>
      {children}
    </button>
  );
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return (
    <tr>
      <td colSpan={columns} className="empty-row">{text}</td>
    </tr>
  );
}

function buildMarkerArguments(label: string, note: string, markerId: string): Record<string, unknown> {
  const trimmedNote = note.trim();
  const argumentsPayload: Record<string, unknown> = {
    reason: "dashboard",
    markerId,
    label: label.trim(),
  };
  if (trimmedNote) {
    argumentsPayload.note = trimmedNote;
  }
  return argumentsPayload;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sensorPublishTopics(status: StatusResponse): string[] {
  const topics = new Set<string>();
  for (const client of status.clients) {
    if (!client.role.toLowerCase().includes("sensor")) {
      continue;
    }
    const metadata = client.metadata ?? {};
    addTopicValue(topics, metadata.contract);
    addTopicValue(topics, metadata.topic);
    addTopicList(topics, metadata.topics);
  }
  return Array.from(topics).sort();
}

function addTopicValue(topics: Set<string>, value: unknown) {
  if (typeof value === "string" && value.trim()) {
    topics.add(value.trim());
  }
}

function addTopicList(topics: Set<string>, value: unknown) {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    addTopicValue(topics, item);
  }
}

function createMarkerId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `marker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sensorSummaryForClient(summaries: SensorTelemetrySummary[], clientId: string): SensorTelemetrySummary | null {
  return summaries.find((summary) => summary.clientId === clientId || summary.device === clientId) ?? null;
}

function formatBpm(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "--";
}

function formatRrMs(value: number | undefined): string {
  return typeof value === "number" ? `${value} ms` : "--";
}

function formatSamplesPerMinute(value: number | undefined): string {
  return typeof value === "number" ? `${value}/min` : "--";
}

function formatBpmRange(min: number | undefined, avg: number | undefined, max: number | undefined): string {
  if (typeof min !== "number" || typeof avg !== "number" || typeof max !== "number") {
    return "--";
  }
  return `${Math.round(min)} / ${formatReportNumber(avg)} / ${Math.round(max)}`;
}

function formatReportNumber(value: number | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatReportMs(value: number | undefined): string {
  return typeof value === "number" ? `${formatReportNumber(value)} ms` : "--";
}

function markerGroupTooltip(group: BiometricChartMarkerGroup): string {
  return group.markers
    .map((marker) =>
      [
        `${marker.label} at ${formatExperienceTime(marker.experienceTimeMs)}`,
        marker.note,
        marker.source ? `source ${marker.source}` : null,
        markerBiometricSummary(marker),
      ]
        .filter((part): part is string => Boolean(part) && part !== "--")
        .join("; "),
    )
    .join("\n");
}

function markerBiometricSummary(marker: BiometricChartMarkerGroup["markers"][number]): string {
  const values = [
    typeof marker.bpm === "number" ? `BPM ${formatReportNumber(marker.bpm)}` : null,
    typeof marker.rrMs === "number" ? `RR ${formatReportMs(marker.rrMs)}` : null,
    marker.sensorSignal ? `signal ${marker.sensorSignal}` : null,
  ].filter((part): part is string => Boolean(part));
  return values.length > 0 ? values.join(" / ") : "--";
}

function markerGroupTimeRange(group: BiometricChartMarkerGroup): string {
  const times = group.markers.map((marker) => marker.experienceTimeMs);
  const first = Math.min(...times);
  const last = Math.max(...times);
  return first === last ? formatExperienceTime(first) : `${formatExperienceTime(first)} - ${formatExperienceTime(last)}`;
}

function shortPopoverText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function titleForView(view: View): string {
  if (view === "subject") return "Subject Registry";
  if (view === "session") return "Session Control";
  if (view === "clients") return "Connected Clients";
  if (view === "topics") return "Topic Stream";
  if (view === "diagnostics") return "System Diagnostics";
  return "Operational Overview";
}

function commandDialogTitle(action: UnrealCommandAction): string {
  if (action === "pause-session") return "Pause session";
  if (action === "resume-session") return "Resume session";
  return "Add marker";
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour12: false });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  });
}

function formatDuration(value: number | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(2)} s`;
}

function formatSessionMs(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(1)} s`;
}

function readinessToneForSession(state: ObservedSessionState): "ready" | "warn" | "danger" | "idle" {
  if (state === "running") return "ready";
  if (state === "paused") return "warn";
  if (state === "error") return "danger";
  return "idle";
}

function toWsPreview(endpoint: string): string {
  const url = new URL("/ws", endpoint);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
