import { StatusPill } from "../../components/StatusPill";
import { eventSeverity, summarizePayload } from "../../domain/hubStatus";
import type { StreamEvent } from "../../domain/types";
import { formatTime } from "../../lib/format";
import { severityTone } from "../topics/eventSeverity";

export function OverviewEventList({ events }: { events: StreamEvent[] }) {
  if (events.length === 0) {
    return <p className="empty-state">Nenhum evento ao vivo recebido desde que esta página foi aberta.</p>;
  }

  return (
    <div className="overview-event-list">
      {events.map((event, index) => {
        const severity = eventSeverity(event);
        return (
          <article className={`overview-event ${severity}`} key={`${event.receivedAt}-${event.envelope.id ?? index}`}>
            <div className="overview-event-meta">
              <span className="mono">{formatTime(event.receivedAt)}</span>
              <StatusPill tone={severityTone(severity)} label={event.envelope.type} />
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
