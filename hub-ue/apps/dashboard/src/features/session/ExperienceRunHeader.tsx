import { Metric } from "../../components/Metric";
import { StatusPill } from "../../components/StatusPill";
import type { PendingLifecycleTransition } from "../../domain/experienceLifecycle";
import { formatExperienceTime } from "../../domain/experienceRun";
import type { ExperienceRunState, ExperienceRunSummary } from "../../domain/experienceRun";
import type { RunHeaderSummary } from "../../domain/sessionControlUi";
import type { SessionStateSummary } from "../../domain/sessionState";
import { formatDateTime } from "../../lib/format";

interface ExperienceRunHeaderProps {
  header: RunHeaderSummary;
  pendingLifecycle: PendingLifecycleTransition | null;
  run: ExperienceRunState;
  sessionState: SessionStateSummary;
  /** Motivo pelo qual não é possível iniciar agora; exibido junto ao botão. */
  startBlockedReason?: string;
  summary: ExperienceRunSummary;
  wasRestored: boolean;
  onEnd: () => void;
  onStart: () => void;
  onStartNext: () => void;
}

function runSourceLabel(source: ExperienceRunState["source"]): string {
  if (!source) {
    return "origem não registrada";
  }
  return `iniciada pelo ${source === "xr" ? "XR" : "dashboard"}`;
}

/** Rótulo do botão conforme a fase da transição: normal, aguardando ou pedindo nova tentativa. */
function transitionLabel(
  pending: PendingLifecycleTransition | null,
  event: PendingLifecycleTransition["event"],
  labels: { idle: string; awaiting: string; retry: string },
): string {
  if (pending?.event !== event) {
    return labels.idle;
  }
  return pending.phase === "uncertain" ? labels.retry : labels.awaiting;
}

/** Cabeçalho da experiência: estado, relógio e a ação principal do momento. */
export function ExperienceRunHeader({
  header,
  onEnd,
  onStart,
  onStartNext,
  pendingLifecycle,
  run,
  sessionState,
  startBlockedReason,
  summary,
  wasRestored,
}: ExperienceRunHeaderProps) {
  const isActive = run.status === "running" || run.status === "paused";
  const isEnded = run.status === "ended";
  const endIsAwaiting = Boolean(pendingLifecycle && pendingLifecycle.phase !== "uncertain");
  const startLabels = { idle: "Iniciar experiência", awaiting: "Iniciando…", retry: "Tentar iniciar de novo" };
  // O motivo de um botão indisponível fica sempre visível, não escondido em um tooltip.
  const actionHint = isActive
    ? endIsAwaiting
      ? "Aguardando a confirmação do lifecycle pelo hub."
      : null
    : (startBlockedReason ?? null);

  return (
    <section className={`experience-run-header ${run.status}`} aria-label="Experiência">
      <div className="experience-run-title">
        <span>Experiência</span>
        <strong>{header.experienceLabel}</strong>
        {wasRestored && <StatusPill tone="muted" label="Restaurada deste navegador" />}
        <div className="run-header-chip-row">
          <StatusPill tone={header.unrealTone} label={header.unrealLabel} />
          <StatusPill tone={header.sensorTone} label={header.sensorLabel} />
        </div>
      </div>

      <div className="experience-run-metrics">
        <Metric label="Tempo de experiência" value={formatExperienceTime(summary.experienceTimeMs)} />
        <Metric label="Tempo em pausa" value={formatExperienceTime(summary.pausedTimeMs)} small />
        <Metric label="Início" value={run.startedAt ? formatDateTime(run.startedAt) : "--"} small />
        <Metric label="Markers" value={summary.markerCount} small />
        {isEnded && <Metric label="Fim" value={run.endedAt ? formatDateTime(run.endedAt) : "--"} small />}
      </div>

      <div className="experience-run-observed">
        <span>{runSourceLabel(run.source)}</span>
        {run.runId && <span className="mono">run {run.runId}</span>}
        {run.label && <span>{run.label}</span>}
        <span>{header.unrealDetail}</span>
        <span>{header.sensorDetail}</span>
        <span>último comando {sessionState.lastCommandId ?? "--"}</span>
      </div>

      <div className="experience-run-actions">
        {run.status === "not_started" && (
          <button className="command-button strong" disabled={Boolean(startBlockedReason)} type="button" onClick={onStart}>
            {transitionLabel(pendingLifecycle, "started", startLabels)}
          </button>
        )}
        {isActive && (
          <button className="command-button danger" disabled={endIsAwaiting} type="button" onClick={onEnd}>
            {transitionLabel(pendingLifecycle, "ended", {
              idle: "Encerrar experiência",
              awaiting: "Encerrando…",
              retry: "Tentar encerrar de novo",
            })}
          </button>
        )}
        {isEnded && (
          <button className="command-button" disabled={Boolean(startBlockedReason)} type="button" onClick={onStartNext}>
            {transitionLabel(pendingLifecycle, "started", { ...startLabels, idle: "Iniciar próxima experiência" })}
          </button>
        )}
      </div>
      {actionHint && <p className="inline-hint experience-run-hint">{actionHint}</p>}
    </section>
  );
}
