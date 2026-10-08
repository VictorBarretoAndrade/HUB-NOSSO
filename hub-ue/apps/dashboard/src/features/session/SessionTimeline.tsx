import { formatExperienceTime } from "../../domain/experienceRun";
import type { AnalyticSessionTimelineItem, ExperienceRunState } from "../../domain/experienceRun";
import { formatDateTime, formatSessionMs } from "../../lib/format";
import { experiencePhaseLabel, timelineKindLabel } from "./timelineLabels";

interface SessionTimelineProps {
  filtersActive: boolean;
  hasUnrealClient: boolean;
  runStatus: ExperienceRunState["status"];
  timeline: AnalyticSessionTimelineItem[];
  totalCount: number;
  onClearFilters: () => void;
}

/** Explica por que a timeline está vazia de acordo com o momento da sessão. */
function emptyMessage(runStatus: ExperienceRunState["status"], hasUnrealClient: boolean): string {
  if (runStatus === "not_started") {
    return "Inicie a experiência para começar a timeline analítica.";
  }
  if (runStatus === "ended") {
    return "A experiência terminou sem mudanças de estado nem markers capturados.";
  }
  if (!hasUnrealClient) {
    return "Nenhum cliente Unreal conectado. Adicione markers pela aba Operação, ou conecte o Unreal para capturar também as mudanças de estado.";
  }
  return "Aguardando eventos de experience.lifecycle, unreal.state ou experience.marker.";
}

export function SessionTimeline({
  filtersActive,
  hasUnrealClient,
  onClearFilters,
  runStatus,
  timeline,
  totalCount,
}: SessionTimelineProps) {
  if (timeline.length === 0) {
    if (filtersActive && totalCount > 0) {
      return (
        <div className="empty-state timeline-empty">
          <p>Nenhum item da timeline corresponde aos filtros atuais.</p>
          <button className="mini-button" type="button" onClick={onClearFilters}>
            Limpar filtros
          </button>
        </div>
      );
    }
    return <p className="empty-state timeline-empty">{emptyMessage(runStatus, hasUnrealClient)}</p>;
  }

  return (
    <ol className="timeline-list">
      {timeline.map((item) => (
        <li className={`timeline-item ${item.kind} ${item.tone} phase-${item.phase}`} key={item.id}>
          <div className="timeline-rail">
            <span className="timeline-time mono">{formatExperienceTime(item.experienceTimeMs)}</span>
            <span className="timeline-dot" aria-hidden />
            <span className="timeline-kind">{timelineKindLabel(item.kind)}</span>
          </div>
          <div className="timeline-copy">
            <div className="timeline-title-row">
              <strong>{item.title}</strong>
              <span className="mono">{formatDateTime(item.realReceivedAt)}</span>
            </div>
            <p>{item.detail}</p>
            <div className="timeline-meta">
              <span className={`phase-pill ${item.phase}`}>{experiencePhaseLabel(item.phase)}</span>
              <span className="mono">origem {item.source ?? item.sourceClientId}</span>
              {item.source && item.source !== item.sourceClientId && (
                <span className="mono">cliente {item.sourceClientId}</span>
              )}
              <span className="mono">hub t+{formatSessionMs(item.sessionTimeMs)}</span>
              {item.commandId && <span className="mono">comando {item.commandId}</span>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
