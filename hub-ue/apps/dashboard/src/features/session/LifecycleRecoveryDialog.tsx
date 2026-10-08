import { Dialog } from "../../components/Dialog";
import { isLifecycleRecoveryCurrent } from "../../domain/experienceLifecycle";
import type { SocketState } from "../../domain/types";

interface LifecycleRecoveryDialogProps {
  /** Run que o hub reporta como ativa agora (pode ter mudado com o diálogo aberto). */
  activeRunId: string | null;
  runId: string;
  socketState: SocketState;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirma o encerramento forçado de uma run órfã que ainda está ativa no hub. */
export function LifecycleRecoveryDialog({ activeRunId, onCancel, onConfirm, runId, socketState }: LifecycleRecoveryDialogProps) {
  const activeRunChanged = !isLifecycleRecoveryCurrent(runId, activeRunId);
  const isConnected = socketState === "connected";

  return (
    <Dialog
      className="lifecycle-recovery-dialog"
      eyebrow="Recuperação do lifecycle"
      title="Encerrar a run ativa?"
      onClose={onCancel}
      actions={
        <>
          <button className="mini-button" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="mini-button danger" disabled={!isConnected || activeRunChanged} type="button" onClick={onConfirm}>
            Encerrar run
          </button>
        </>
      }
    >
      <p>
        Continue somente depois de confirmar que esta experiência não está mais rodando no Unreal. O hub publicará um
        evento oficial de encerramento e desvinculará os sensores.
      </p>
      <dl>
        <dt>Run ativa</dt>
        <dd className="mono">{runId}</dd>
        <dt>Logs da sessão</dt>
        <dd>Preservados no JSONL</dd>
        <dt>Relatório local</dt>
        <dd>Preservado</dd>
        <dt>Próxima run</dt>
        <dd>Exige um novo clique do operador</dd>
      </dl>
      {activeRunChanged && (
        <p className="dialog-warning" role="alert">
          A run ativa no hub mudou enquanto esta confirmação estava aberta. Cancele e revise o estado atual.
        </p>
      )}
      {!isConnected && (
        <p className="dialog-warning" role="alert">
          Reconecte o dashboard ao hub antes de encerrar a run.
        </p>
      )}
    </Dialog>
  );
}
