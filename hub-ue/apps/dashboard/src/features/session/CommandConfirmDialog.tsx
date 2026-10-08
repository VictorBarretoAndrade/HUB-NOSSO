import { Dialog } from "../../components/Dialog";
import { COMMAND_TOPIC } from "../../domain/api";

/** Comandos que mudam o estado da sessão no Unreal e por isso pedem confirmação. */
export type SessionStateCommand = "pause-session" | "resume-session";

const COMMAND_TITLE: Record<SessionStateCommand, string> = {
  "pause-session": "Pausar sessão",
  "resume-session": "Retomar sessão",
};

interface CommandConfirmDialogProps {
  action: SessionStateCommand;
  recipientCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CommandConfirmDialog({ action, onCancel, onConfirm, recipientCount }: CommandConfirmDialogProps) {
  const title = COMMAND_TITLE[action];

  return (
    <Dialog
      eyebrow="Confirmar comando"
      title={`${title}?`}
      onClose={onCancel}
      actions={
        <>
          <button className="mini-button" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="mini-button strong" type="button" onClick={onConfirm}>
            {title}
          </button>
        </>
      }
    >
      <p>O comando será publicado para o Unreal, que precisa responder com um ACK.</p>
      <dl>
        <dt>Tópico</dt>
        <dd className="mono">{COMMAND_TOPIC}</dd>
        <dt>Destinatários</dt>
        <dd>{recipientCount}</dd>
        <dt>ACK</dt>
        <dd>obrigatório</dd>
      </dl>
    </Dialog>
  );
}
