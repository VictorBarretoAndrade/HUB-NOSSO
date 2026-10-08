import { EmptyRow } from "../../components/EmptyRow";
import { StatusPill } from "../../components/StatusPill";
import { eventSeverity, summarizePayload } from "../../domain/hubStatus";
import type { StreamEvent } from "../../domain/types";
import { formatTime } from "../../lib/format";
import { severityLabel, severityRowClass, severityTone } from "./eventSeverity";

interface EventTableProps {
  events: StreamEvent[];
  hasFilter: boolean;
  selectedKey: string | null;
  onSelect: (event: StreamEvent) => void;
}

/** Identidade estável de um evento do stream (nem todo envelope traz id). */
export function eventKey(event: StreamEvent): string {
  const { clientId, id, topic } = event.envelope;
  return `${event.receivedAt}|${id ?? ""}|${clientId}|${topic ?? ""}`;
}

export function EventTable({ events, hasFilter, onSelect, selectedKey }: EventTableProps) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Hora</th>
            <th scope="col">Tópico</th>
            <th scope="col">Tipo</th>
            <th scope="col">Client ID</th>
            <th scope="col">Mensagem</th>
            <th scope="col">Severidade</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => {
            const severity = eventSeverity(event);
            const key = eventKey(event);
            const isSelected = key === selectedKey;
            return (
              <tr
                className={`${severityRowClass(severity)} ${isSelected ? "selected" : ""}`.trim()}
                key={`${key}|${index}`}
                onClick={() => onSelect(event)}
              >
                <td className="mono">
                  <button
                    aria-label={`Inspecionar evento das ${formatTime(event.receivedAt)}`}
                    aria-pressed={isSelected}
                    className="row-select"
                    type="button"
                  >
                    {formatTime(event.receivedAt)}
                  </button>
                </td>
                <td className="mono">{event.envelope.topic ?? "--"}</td>
                <td>
                  <StatusPill tone={severityTone(severity)} label={event.envelope.type} />
                </td>
                <td className="mono">{event.envelope.clientId}</td>
                <td>{summarizePayload(event.envelope.payload)}</td>
                <td>{severityLabel(severity)}</td>
              </tr>
            );
          })}
          {events.length === 0 && (
            <EmptyRow
              columns={6}
              text={
                hasFilter
                  ? "Nenhum evento corresponde ao filtro. Ajuste ou limpe o filtro."
                  : "Nenhum evento ao vivo recebido desde que esta página foi aberta."
              }
            />
          )}
        </tbody>
      </table>
    </div>
  );
}
