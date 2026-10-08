import { Dialog } from "../../components/Dialog";

/** Transições da experiência que não podem ser desfeitas e por isso pedem confirmação. */
export type ExperienceConfirmation = "start-with-issues" | "end" | "start-next";

interface ExperienceConfirmDialogProps {
  kind: ExperienceConfirmation;
  /** Pendências de preparação listadas ao iniciar com o cadastro incompleto. */
  setupIssues: string[];
  onCancel: () => void;
  onConfirm: () => void;
}

const COPY: Record<ExperienceConfirmation, { eyebrow: string; title: string; confirmLabel: string; danger: boolean }> = {
  "start-with-issues": {
    eyebrow: "Preparação incompleta",
    title: "Iniciar mesmo assim?",
    confirmLabel: "Iniciar mesmo assim",
    danger: false,
  },
  end: {
    eyebrow: "Encerrar experiência",
    title: "Encerrar a experiência agora?",
    confirmLabel: "Encerrar experiência",
    danger: true,
  },
  "start-next": {
    eyebrow: "Próxima experiência",
    title: "Iniciar a próxima experiência?",
    confirmLabel: "Iniciar próxima",
    danger: false,
  },
};

export function ExperienceConfirmDialog({ kind, onCancel, onConfirm, setupIssues }: ExperienceConfirmDialogProps) {
  const copy = COPY[kind];

  return (
    <Dialog
      eyebrow={copy.eyebrow}
      title={copy.title}
      onClose={onCancel}
      actions={
        <>
          <button className="mini-button" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className={`mini-button ${copy.danger ? "danger" : "strong"}`} type="button" onClick={onConfirm}>
            {copy.confirmLabel}
          </button>
        </>
      }
    >
      {kind === "start-with-issues" && (
        <>
          <p>A experiência pode ser iniciada, mas ficará registrada sem estas informações:</p>
          <ul className="dialog-list">
            {setupIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </>
      )}
      {kind === "end" && (
        <p>
          O hub publicará o encerramento, os sensores serão desvinculados e o relatório será gerado. Uma experiência
          encerrada não pode ser retomada.
        </p>
      )}
      {kind === "start-next" && (
        <>
          <p>
            O relatório da experiência anterior será substituído pelo da nova. Exporte os arquivos de que precisa na
            aba Relatório antes de continuar.
          </p>
          {setupIssues.length > 0 && (
            <ul className="dialog-list">
              {setupIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}
