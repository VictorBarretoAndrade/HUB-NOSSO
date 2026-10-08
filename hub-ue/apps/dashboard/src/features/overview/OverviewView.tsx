import { Activity, ArrowRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { HubLinkState } from "../../app/hooks/useHubStatus";
import type { View } from "../../app/navigation";
import { Metric } from "../../components/Metric";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type { StatusTone } from "../../components/StatusPill";
import { activeTopicCount } from "../../domain/hubStatus";
import type { ReadinessItem, ReadinessTone } from "../../domain/hubStatus";
import type { ExperienceMarkerSummary } from "../../domain/markers";
import type { ManagedSensorView } from "../../domain/sensorManager";
import type { SensorDataStreamSnapshot, SensorTelemetrySummary } from "../../domain/sensorTelemetry";
import { sessionStateLabel } from "../../domain/sessionState";
import type { ObservedSessionState, SessionStateSummary } from "../../domain/sessionState";
import type { HealthResponse, HubClient, StatusResponse, StreamEvent } from "../../domain/types";
import { OverviewEventList } from "./OverviewEventList";
import { SensorDataStreamPanel } from "./SensorDataStreamPanel";
import { SensorOverviewStrip } from "./SensorOverviewStrip";

const RECENT_EVENT_COUNT = 5;

const HUB_PILL: Record<HubLinkState, { label: string; tone: StatusTone }> = {
  loading: { label: "Conectando…", tone: "muted" },
  online: { label: "Sessão visível", tone: "ok" },
  offline: { label: "Hub offline", tone: "error" },
};

interface OverviewViewProps {
  actions: string[];
  clients: HubClient[];
  events: StreamEvent[];
  health: HealthResponse | null;
  latestMarker: ExperienceMarkerSummary | null;
  linkState: HubLinkState;
  managedSensors: ManagedSensorView[];
  readiness: ReadinessItem[];
  sensorDataStream: SensorDataStreamSnapshot;
  sensorSummaries: SensorTelemetrySummary[];
  sessionState: SessionStateSummary;
  status: StatusResponse | null;
  onExportSensorDataJson: () => void;
  onNavigate: (view: View) => void;
  onRefresh: () => void;
}

function readinessToneForSession(state: ObservedSessionState): ReadinessTone {
  if (state === "running") return "ready";
  if (state === "paused") return "warn";
  if (state === "error") return "danger";
  return "idle";
}

export function OverviewView(props: OverviewViewProps) {
  const [selectedSensorId, setSelectedSensorId] = useState("");
  const hubPill = HUB_PILL[props.linkState];

  return (
    <section className="content-grid overview-grid">
      <Panel
        className="readiness-panel overview-wide"
        title="Prontidão do sistema"
        action={
          <div className="panel-actions">
            <StatusPill tone={hubPill.tone} label={hubPill.label} />
            <button className="mini-button" type="button" onClick={props.onRefresh}>
              <RefreshCw aria-hidden size={14} /> Atualizar
            </button>
          </div>
        }
      >
        <div className="readiness-row">
          <div className={`readiness-cell ${readinessToneForSession(props.sessionState.state)}`}>
            <Activity aria-hidden size={22} />
            <strong>Sessão</strong>
            <span>{sessionStateLabel(props.sessionState.state)}</span>
          </div>
          {props.readiness.map((item) => (
            <div className={`readiness-cell ${item.tone}`} key={item.label}>
              <Activity aria-hidden size={22} />
              <strong>{item.label}</strong>
              <span>{item.state}</span>
            </div>
          ))}
        </div>
        <div className="overview-metrics">
          <Metric label="Clientes" value={props.status?.clientCount ?? props.clients.length} />
          <Metric label="ACKs pendentes" value={props.status?.pendingAckCount ?? props.health?.pendingAcks ?? 0} />
          <Metric label="Tópicos ativos" value={activeTopicCount(props.status)} />
          <Metric label="Último marker" value={props.latestMarker?.label ?? "--"} small />
        </div>
        <SensorOverviewStrip
          dataStream={props.sensorDataStream}
          managedSensors={props.managedSensors}
          selectedSensorId={selectedSensorId}
          summaries={props.sensorSummaries}
          onSelectSensor={setSelectedSensorId}
        />
      </Panel>

      <Panel
        title="Próximos passos"
        action={
          <button className="mini-button" type="button" onClick={() => props.onNavigate("guide")}>
            Guia de uso <ArrowRight aria-hidden size={14} />
          </button>
        }
      >
        <ul className="required-list">
          {props.actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </Panel>

      <Panel
        className="event-panel"
        title="Eventos recentes"
        action={
          <button className="mini-button" type="button" onClick={() => props.onNavigate("topics")}>
            Ver todos <ArrowRight aria-hidden size={14} />
          </button>
        }
      >
        <OverviewEventList events={props.events.slice(0, RECENT_EVENT_COUNT)} />
      </Panel>

      <SensorDataStreamPanel snapshot={props.sensorDataStream} onExportJson={props.onExportSensorDataJson} />
    </section>
  );
}
