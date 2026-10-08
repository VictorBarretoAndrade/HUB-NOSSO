import { EmptyRow } from "../../components/EmptyRow";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type { CommandStatus } from "../../domain/api";
import { commandObservedStateDetail, commandRowClass, commandStatusTone } from "../../domain/commandHistory";
import type { CommandHistoryItem } from "../../domain/commandHistory";
import type { SessionStateSummary } from "../../domain/sessionState";
import type { PendingAck, StreamEvent } from "../../domain/types";
import { formatDuration, formatTime } from "../../lib/format";

const VISIBLE_COMMAND_LIMIT = 12;

const STATUS_LABEL: Record<CommandStatus, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  rejected: "Rejeitado",
  timeout: "Sem resposta",
  failed: "Falhou",
};

interface CommandHistoryTabProps {
  commandHistory: CommandHistoryItem[];
  events: StreamEvent[];
  pendingAcks: PendingAck[];
  sessionState: SessionStateSummary;
  onClearHistory: () => void;
}

/** Comandos enviados por este dashboard e o acompanhamento dos ACKs. */
export function CommandHistoryTab({ commandHistory, events, onClearHistory, pendingAcks, sessionState }: CommandHistoryTabProps) {
  const visibleCommands = commandHistory.slice(0, VISIBLE_COMMAND_LIMIT);
  const hiddenCount = commandHistory.length - visibleCommands.length;

  return (
    <Panel
      className="event-panel command-history-panel"
      title="Histórico de comandos e ACKs"
      action={
        <div className="panel-actions">
          <StatusPill
            tone={pendingAcks.length > 0 ? "warn" : "muted"}
            label={pendingAcks.length > 0 ? "ACK pendente no hub" : "Sem ACKs pendentes"}
          />
          <button
            className="mini-button"
            disabled={commandHistory.length === 0}
            title="Limpa apenas esta lista; o relatório mantém todos os comandos"
            type="button"
            onClick={onClearHistory}
          >
            Limpar lista
          </button>
        </div>
      }
    >
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Mensagem</th>
              <th scope="col">Ação</th>
              <th scope="col">Destino</th>
              <th scope="col">Enviado</th>
              <th scope="col">Duração</th>
              <th scope="col">Cliente do ACK</th>
              <th scope="col">Status</th>
              <th scope="col">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {visibleCommands.map((item) => (
              <tr className={commandRowClass(item.status)} key={item.messageId}>
                <td className="mono">{item.messageId}</td>
                <td className="mono">{item.action}</td>
                <td>{item.target}</td>
                <td className="mono">{formatTime(item.sentAt)}</td>
                <td className="mono">{formatDuration(item.durationMs)}</td>
                <td className="mono">{item.ackClientId ?? "--"}</td>
                <td>
                  <StatusPill tone={commandStatusTone(item.status)} label={STATUS_LABEL[item.status]} />
                </td>
                <td>{commandObservedStateDetail(item, sessionState, events)}</td>
              </tr>
            ))}
            {commandHistory.length === 0 && (
              <EmptyRow columns={8} text="Nenhum comando enviado por este dashboard nesta sessão do navegador." />
            )}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <p className="muted-copy table-footnote">
          Mostrando os {VISIBLE_COMMAND_LIMIT} comandos mais recentes de {commandHistory.length}. O relatório inclui
          todos.
        </p>
      )}
      {pendingAcks.length > 0 && (
        <div className="pending-ack-strip">
          <strong>ACKs pendentes no hub</strong>
          {pendingAcks.map((ack) => (
            <span className="mono" key={`${ack.messageId}-${ack.recipientClientId}`}>
              {ack.messageId} {"→"} {ack.recipientClientId}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}
