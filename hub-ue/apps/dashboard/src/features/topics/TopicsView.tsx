import { Pause, Play, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type { StatusTone } from "../../components/StatusPill";
import type { SocketState, StreamEvent } from "../../domain/types";
import { formatTime } from "../../lib/format";
import { EventTable, eventKey } from "./EventTable";

const SOCKET_STATUS: Record<SocketState, { label: string; tone: StatusTone }> = {
  idle: { label: "Inativo", tone: "muted" },
  connecting: { label: "Conectando…", tone: "warn" },
  connected: { label: "Ao vivo", tone: "ok" },
  reconnecting: { label: "Reconectando…", tone: "warn" },
  error: { label: "Indisponível", tone: "error" },
};

function matchesQuery(event: StreamEvent, query: string): boolean {
  const { clientId, topic, type } = event.envelope;
  return (
    (topic?.toLowerCase().includes(query) ?? false) ||
    clientId.toLowerCase().includes(query) ||
    type.toLowerCase().includes(query)
  );
}

/** Stream ao vivo dos tópicos, com filtro, pausa e inspeção do payload de um evento. */
export function TopicsView({ events, socketState }: { events: StreamEvent[]; socketState: SocketState }) {
  const [query, setQuery] = useState("");
  // Com o stream pausado a lista congela, para dar tempo de ler e inspecionar.
  const [frozenEvents, setFrozenEvents] = useState<StreamEvent[] | null>(null);
  const [pinnedEvent, setPinnedEvent] = useState<StreamEvent | null>(null);

  const isPaused = frozenEvents !== null;
  const sourceEvents = frozenEvents ?? events;
  const visibleEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery ? sourceEvents.filter((event) => matchesQuery(event, normalizedQuery)) : sourceEvents;
  }, [query, sourceEvents]);

  const inspectedEvent = pinnedEvent ?? visibleEvents[0] ?? null;
  const socketStatus = SOCKET_STATUS[socketState];

  return (
    <section className="topics-layout">
      <div className="topic-stream">
        <div className="table-toolbar">
          <label className="toolbar-search" htmlFor="topic-filter">
            <Search aria-hidden size={16} />
            <span className="visually-hidden">Filtrar eventos por tópico, cliente ou tipo</span>
            <input
              id="topic-filter"
              placeholder="Filtrar por tópico, cliente ou tipo"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {query && (
            <button className="mini-button" type="button" onClick={() => setQuery("")}>
              <X aria-hidden size={14} /> Limpar filtro
            </button>
          )}
          <span className="counter">
            {visibleEvents.length} de {sourceEvents.length} eventos
          </span>
          <button
            aria-pressed={isPaused}
            className="mini-button"
            type="button"
            onClick={() => setFrozenEvents(isPaused ? null : events)}
          >
            {isPaused ? <Play aria-hidden size={14} /> : <Pause aria-hidden size={14} />}
            {isPaused ? "Retomar stream" : "Pausar stream"}
          </button>
          <StatusPill tone={isPaused ? "warn" : socketStatus.tone} label={isPaused ? "Pausado" : socketStatus.label} />
        </div>
        <EventTable
          events={visibleEvents}
          hasFilter={query.trim().length > 0}
          selectedKey={pinnedEvent ? eventKey(pinnedEvent) : null}
          onSelect={setPinnedEvent}
        />
      </div>

      <Panel
        className="payload-panel"
        title="Inspetor de payload"
        action={
          pinnedEvent && (
            <button className="mini-button" type="button" onClick={() => setPinnedEvent(null)}>
              Seguir o mais recente
            </button>
          )
        }
      >
        {inspectedEvent ? (
          <>
            <p className="muted-copy inspector-mode">
              {pinnedEvent
                ? "Evento fixado. Ele permanece aqui enquanto novos eventos chegam."
                : "Mostrando o evento mais recente. Selecione uma linha para fixar um evento."}
            </p>
            <dl className="detail-list">
              <dt>Hora</dt>
              <dd className="mono">{formatTime(inspectedEvent.receivedAt)}</dd>
              <dt>Tópico</dt>
              <dd className="mono">{inspectedEvent.envelope.topic ?? "--"}</dd>
              <dt>Client ID</dt>
              <dd className="mono">{inspectedEvent.envelope.clientId}</dd>
              <dt>Tipo</dt>
              <dd className="mono">{inspectedEvent.envelope.type}</dd>
            </dl>
            <pre className="payload-box">{JSON.stringify(inspectedEvent.envelope.payload ?? {}, null, 2)}</pre>
          </>
        ) : (
          <p className="muted-copy">
            Nenhum evento para inspecionar. Conecte um cliente ou inicie um simulador para alimentar o stream.
          </p>
        )}
      </Panel>
    </section>
  );
}
