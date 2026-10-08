import { Pause, Play, SlidersHorizontal } from "lucide-react";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type { ExperienceRunState } from "../../domain/experienceRun";
import type { SessionStateSummary } from "../../domain/sessionState";
import type { HubClient } from "../../domain/types";
import type { SessionStateCommand } from "./CommandConfirmDialog";
import { CommandRecipientsList } from "./CommandRecipientsList";
import { MarkerForm } from "./MarkerForm";

interface OperateTabProps {
  canPause: boolean;
  canResume: boolean;
  commandClients: HubClient[];
  isDispatching: boolean;
  runStatus: ExperienceRunState["status"];
  sessionState: SessionStateSummary;
  onAddMarker: (label: string, note: string) => void;
  onRequestCommand: (action: SessionStateCommand) => void;
}

/** Explica por que Pausar/Retomar estão indisponíveis, em vez de só desabilitar os botões. */
function macroHint(props: Pick<OperateTabProps, "commandClients" | "runStatus" | "sessionState" | "isDispatching">): string | null {
  if (props.runStatus === "not_started") {
    return "Inicie a experiência para habilitar Pausar, Retomar e os markers.";
  }
  if (props.runStatus === "ended") {
    return "A experiência foi encerrada. Inicie a próxima para enviar novos comandos.";
  }
  if (props.commandClients.length === 0) {
    return null; // A lista de destinatários já explica a ausência de clientes.
  }
  if (props.isDispatching) {
    return "Aguardando o ACK do comando anterior.";
  }
  if (props.sessionState.state === "paused") {
    return "A sessão está pausada. Retomar está disponível; Pausar volta quando o stream reportar execução.";
  }
  return null;
}

export function OperateTab(props: OperateTabProps) {
  const { canPause, canResume, commandClients, isDispatching, onAddMarker, onRequestCommand, runStatus } = props;
  const experienceIsActive = runStatus === "running" || runStatus === "paused";
  const subscriberCount = commandClients.length;
  const hint = macroHint(props);

  return (
    <>
      <Panel
        title="Comandos da sessão"
        action={
          <StatusPill
            tone={subscriberCount > 0 ? "ok" : "warn"}
            label={
              subscriberCount === 0
                ? "Sem destinatário de comandos"
                : subscriberCount === 1
                  ? "1 destinatário"
                  : `${subscriberCount} destinatários`
            }
          />
        }
      >
        <div className="macro-grid">
          <button
            className="macro-button primary"
            disabled={!canPause}
            type="button"
            onClick={() => onRequestCommand("pause-session")}
          >
            <Pause aria-hidden size={18} />
            Pausar sessão
          </button>
          <button
            className="macro-button primary"
            disabled={!canResume}
            type="button"
            onClick={() => onRequestCommand("resume-session")}
          >
            <Play aria-hidden size={18} />
            Retomar sessão
          </button>
          <button className="macro-button coming-soon" disabled type="button">
            <SlidersHorizontal aria-hidden size={18} />
            <span>Calibrar</span>
            <small>em breve: aguarda o contrato do protocolo</small>
          </button>
        </div>
        {hint && <p className="inline-hint">{hint}</p>}
        <CommandRecipientsList clients={commandClients} />
      </Panel>

      <MarkerForm
        experienceIsActive={experienceIsActive}
        hasCommandRecipient={subscriberCount > 0}
        isDispatching={isDispatching}
        onAddMarker={onAddMarker}
      />
    </>
  );
}
