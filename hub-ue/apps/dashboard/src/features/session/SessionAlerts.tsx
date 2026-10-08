import { X } from "lucide-react";
import type { View } from "../../app/navigation";
import type { PendingLifecycleTransition } from "../../domain/experienceLifecycle";
import type { SocketState } from "../../domain/types";

interface SessionAlertsProps {
  activeRunConflictId: string | null;
  lifecycleNotice: string | null;
  /** Detalhe de um comando aceito cujo efeito ainda não apareceu no stream. */
  pendingObservationDetail: string | null;
  pendingLifecycle: PendingLifecycleTransition | null;
  /** Pendências de preparação (sujeito/gravação), mostradas antes de iniciar. */
  setupIssues: string[];
  socketState: SocketState;
  onDismissNotice: () => void;
  onNavigate: (view: View) => void;
  onRequestRecovery: (runId: string) => void;
}

/** Avisos contextuais do Controle da sessão, do mais informativo ao mais crítico. */
export function SessionAlerts({
  activeRunConflictId,
  lifecycleNotice,
  onDismissNotice,
  onNavigate,
  onRequestRecovery,
  pendingLifecycle,
  pendingObservationDetail,
  setupIssues,
  socketState,
}: SessionAlertsProps) {
  const isRecovering = pendingLifecycle?.purpose === "recovery";
  const recoveryBlocked =
    socketState !== "connected" || Boolean(pendingLifecycle && pendingLifecycle.phase !== "conflict");

  return (
    <>
      {setupIssues.length > 0 && (
        <div className="observation-strip setup-strip">
          <strong>Antes de iniciar</strong>
          <ul className="strip-list">
            {setupIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <div className="strip-actions">
            <button className="mini-button" type="button" onClick={() => onNavigate("subject")}>
              Abrir Sujeito
            </button>
            <button className="mini-button" type="button" onClick={() => onNavigate("recording")}>
              Abrir Gravação
            </button>
          </div>
        </div>
      )}

      {pendingObservationDetail && (
        <div className="observation-strip" role="status">
          <strong>Aguardando confirmação no stream</strong>
          <span>{pendingObservationDetail}</span>
        </div>
      )}

      {lifecycleNotice && (
        <div className="observation-strip" role="status">
          <strong>Aviso do lifecycle</strong>
          <span>{lifecycleNotice}</span>
          <button aria-label="Dispensar aviso do lifecycle" className="icon-button strip-dismiss" type="button" onClick={onDismissNotice}>
            <X aria-hidden size={14} />
          </button>
        </div>
      )}

      {activeRunConflictId && (
        <div className="lifecycle-conflict-strip" role="alert">
          <div>
            <strong>O hub tem uma run ativa que precisa ser recuperada</strong>
            <span>
              O hub ainda reporta a run <span className="mono">{activeRunConflictId}</span> como ativa. Encerre-a antes
              de iniciar uma nova experiência.
            </span>
            {socketState !== "connected" && (
              <span className="inline-hint">Reconecte ao hub para poder encerrar a run pendente.</span>
            )}
          </div>
          <button
            className="mini-button danger"
            disabled={recoveryBlocked}
            type="button"
            onClick={() => onRequestRecovery(activeRunConflictId)}
          >
            {isRecovering ? "Encerrando run pendente…" : "Encerrar run pendente"}
          </button>
        </div>
      )}
    </>
  );
}
