import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  activeExperienceRunId,
  applyExperienceLifecycleEvent,
  canReconcileCompletedRecovery,
  createPendingLifecycleTransition,
  EXPERIENCE_LIFECYCLE_TOPIC,
  isLifecycleRecoveryCurrent,
  lifecycleErrorForPending,
  lifecycleSummaryFromEvent,
  lifecycleTransitionConflict,
  markLifecycleTransitionConflict,
  markLifecycleTransitionUncertain,
  unmatchedActiveRunId,
} from "../../domain/experienceLifecycle";
import type {
  ExperienceLifecycleEventType,
  LifecycleTransitionPurpose,
  PendingLifecycleTransition,
} from "../../domain/experienceLifecycle";
import { pauseExperienceRun, resumeExperienceRun } from "../../domain/experienceRun";
import type { ExperienceRunState } from "../../domain/experienceRun";
import type { ManagedSensorView } from "../../domain/sensorManager";
import type { SessionStateSummary } from "../../domain/sessionState";
import type { StatusResponse, StreamEvent } from "../../domain/types";
import { useLatestRef } from "../../lib/useLatestRef";

const LIFECYCLE_CONFIRM_TIMEOUT_MS = 5000;
const DASHBOARD_CLIENT_ID = "dashboard-ui";
const DEFAULT_EXPERIENCE_LABEL = "Dashboard Experience";

interface PublishOptions {
  label?: string;
  purpose?: LifecycleTransitionPurpose;
  reason?: string;
}

export interface ExperienceLifecycleOptions {
  initialRun: ExperienceRunState;
  wasRestored: boolean;
  /** Ref compartilhada com quem precisa ler a run atual fora do ciclo de render. */
  runRef: RefObject<ExperienceRunState>;
  status: StatusResponse | null;
  managedSensors: ManagedSensorView[];
  sessionState: SessionStateSummary;
  isDispatchingSensorCommand: boolean;
  isSocketOpen: () => boolean;
  send: (envelope: Record<string, unknown>) => boolean;
  refresh: () => void;
  /** Contexto anexado ao lifecycle "started" (perfil de captura e sujeito). */
  buildStartContext: () => Record<string, unknown>;
}

export interface LifecycleEventOutcome {
  /** O evento foi totalmente tratado aqui e não deve seguir para a captura. */
  consumed: boolean;
  /** O evento pertence à run local e deve entrar nos eventos da experiência. */
  capture: boolean;
}

export interface ExperienceLifecycle {
  run: ExperienceRunState;
  wasRestored: boolean;
  notice: string | null;
  pending: PendingLifecycleTransition | null;
  /** Run que o hub ainda considera ativa e que não corresponde à run local. */
  activeRunConflictId: string | null;
  recoveryConfirmRunId: string | null;
  start: () => void;
  end: () => void;
  requestRecovery: (runId: string) => void;
  confirmRecovery: () => void;
  cancelRecovery: () => void;
  dismissNotice: () => void;
  handleStreamEvent: (event: StreamEvent) => LifecycleEventOutcome;
  handleDisconnect: () => void;
  reconcileWithStatus: (status: StatusResponse) => void;
}

/**
 * Máquina de estados da experiência: publica experience.lifecycle, acompanha a
 * confirmação pelo hub (aguardando → incerto → conflito) e reconcilia runs órfãs.
 */
export function useExperienceLifecycle(options: ExperienceLifecycleOptions): ExperienceLifecycle {
  const { runRef, sessionState, status } = options;
  const [run, setRunState] = useState<ExperienceRunState>(options.initialRun);
  const [wasRestored, setWasRestored] = useState(options.wasRestored);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPendingState] = useState<PendingLifecycleTransition | null>(null);
  const [recoveryConfirmRunId, setRecoveryConfirmRunId] = useState<string | null>(null);
  const pendingRef = useRef<PendingLifecycleTransition | null>(null);
  const confirmTimeoutRef = useRef<number | null>(null);
  const reconciledRecoveryRunIdRef = useRef<string | null>(null);
  const optionsRef = useLatestRef(options);

  const setRun = useCallback(
    (next: ExperienceRunState) => {
      runRef.current = next;
      setRunState(next);
    },
    [runRef],
  );

  const setPending = useCallback((next: PendingLifecycleTransition | null) => {
    pendingRef.current = next;
    setPendingState(next);
  }, []);

  const clearConfirmTimeout = useCallback(() => {
    if (confirmTimeoutRef.current !== null) {
      window.clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
  }, []);

  const clearPending = useCallback(
    (event?: ExperienceLifecycleEventType, runId?: string) => {
      const current = pendingRef.current;
      if (!current || (event && current.event !== event) || (runId && current.runId !== runId)) {
        return;
      }
      clearConfirmTimeout();
      setPending(null);
    },
    [clearConfirmTimeout, setPending],
  );

  const markPendingUncertain = useCallback(
    (message: string) => {
      const current = pendingRef.current;
      if (!current) {
        return;
      }
      clearConfirmTimeout();
      setPending(markLifecycleTransitionUncertain(current));
      setNotice(message);
    },
    [clearConfirmTimeout, setPending],
  );

  const markPendingConflict = useCallback(
    (message: string) => {
      const current = pendingRef.current;
      if (!current) {
        return;
      }
      clearConfirmTimeout();
      setPending(markLifecycleTransitionConflict(current));
      setNotice(`${message} Uma nova run fica bloqueada até o lifecycle ativo ser reconciliado.`);
    },
    [clearConfirmTimeout, setPending],
  );

  const publish = useCallback(
    (event: ExperienceLifecycleEventType, runId: string, publishOptions: PublishOptions = {}): boolean => {
      const { buildStartContext, isSocketOpen, send } = optionsRef.current;
      if (!isSocketOpen()) {
        setNotice("O lifecycle não foi enviado porque o WebSocket do hub está desconectado.");
        return false;
      }

      const messageId = crypto.randomUUID();
      setPending(
        createPendingLifecycleTransition(event, runId, {
          label: publishOptions.label,
          messageId,
          purpose: publishOptions.purpose,
        }),
      );
      clearConfirmTimeout();
      confirmTimeoutRef.current = window.setTimeout(() => {
        if (pendingRef.current?.messageId !== messageId) {
          return;
        }
        markPendingUncertain(
          `O lifecycle "${event}" da run ${runId} foi enviado, mas não foi observado. A nova tentativa usa o mesmo run id.`,
        );
      }, LIFECYCLE_CONFIRM_TIMEOUT_MS);

      const sent = send({
        id: messageId,
        type: "publish",
        clientId: DASHBOARD_CLIENT_ID,
        topic: EXPERIENCE_LIFECYCLE_TOPIC,
        requiresAck: false,
        payload: {
          event,
          runId,
          label: publishOptions.label,
          source: "dashboard",
          reason: publishOptions.reason ?? "ui",
          ...(event === "started" ? buildStartContext() : {}),
        },
      });
      if (!sent) {
        clearPending(event, runId);
        setNotice("Não foi possível enviar o lifecycle ao hub.");
      }
      return sent;
    },
    [clearConfirmTimeout, clearPending, markPendingUncertain, optionsRef, setPending],
  );

  /** Reenvia uma transição pendente incerta; devolve true se havia transição pendente. */
  const retryPending = useCallback(
    (event: ExperienceLifecycleEventType): boolean => {
      const current = pendingRef.current;
      if (!current) {
        return false;
      }
      if (current.event === event && current.phase === "uncertain") {
        setNotice(null);
        publish(current.event, current.runId, { label: current.label, purpose: current.purpose });
      }
      return true;
    },
    [publish],
  );

  const start = useCallback(() => {
    const { isDispatchingSensorCommand, managedSensors, status: currentStatus } = optionsRef.current;
    if (isDispatchingSensorCommand) {
      return;
    }
    const conflictingRunId = unmatchedActiveRunId(runRef.current, activeExperienceRunId(currentStatus));
    if (conflictingRunId) {
      setNotice(`O hub ainda tem a run ${conflictingRunId} ativa. Encerre a run pendente antes de iniciar outra experiência.`);
      return;
    }
    const attachedSensor = managedSensors.find((sensor) => Boolean(sensor.attachedRunId));
    if (attachedSensor) {
      setNotice(`O sensor ${attachedSensor.sensorId} ainda está vinculado à run ${attachedSensor.attachedRunId}. Aguarde a desvinculação.`);
      return;
    }
    if (retryPending("started")) {
      return;
    }
    setNotice(null);
    setWasRestored(false);
    publish("started", crypto.randomUUID(), { label: DEFAULT_EXPERIENCE_LABEL });
  }, [optionsRef, publish, retryPending, runRef]);

  const end = useCallback(() => {
    if (retryPending("ended")) {
      return;
    }
    const runId = runRef.current.runId;
    if (!runId) {
      return;
    }
    setNotice(null);
    setWasRestored(false);
    publish("ended", runId);
  }, [publish, retryPending, runRef]);

  const requestRecovery = useCallback(
    (runId: string) => {
      const currentActiveRunId = activeExperienceRunId(optionsRef.current.status);
      if (!isLifecycleRecoveryCurrent(runId, currentActiveRunId)) {
        setNotice(
          currentActiveRunId
            ? `A run ativa no hub mudou para ${currentActiveRunId}. Revise-a antes de recuperar.`
            : `A run ${runId} não está mais ativa no hub.`,
        );
        return;
      }
      setRecoveryConfirmRunId(runId);
    },
    [optionsRef],
  );

  const confirmRecovery = useCallback(() => {
    const runId = recoveryConfirmRunId;
    if (!runId) {
      return;
    }
    setRecoveryConfirmRunId(null);
    const currentActiveRunId = activeExperienceRunId(optionsRef.current.status);
    if (!isLifecycleRecoveryCurrent(runId, currentActiveRunId)) {
      setNotice(
        currentActiveRunId
          ? `Recuperação cancelada: a run ativa no hub mudou para ${currentActiveRunId}.`
          : `Recuperação cancelada: a run ${runId} não está mais ativa.`,
      );
      return;
    }
    const current = pendingRef.current;
    if (current && current.phase !== "conflict") {
      setNotice("Aguarde a solicitação de lifecycle em andamento terminar antes de recuperar outra run.");
      return;
    }
    if (current?.phase === "conflict") {
      clearPending();
    }
    setNotice(null);
    reconciledRecoveryRunIdRef.current = null;
    publish("ended", runId, { purpose: "recovery", reason: "operator-recovery" });
  }, [clearPending, optionsRef, publish, recoveryConfirmRunId]);

  const cancelRecovery = useCallback(() => setRecoveryConfirmRunId(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const handleStreamEvent = useCallback(
    (event: StreamEvent): LifecycleEventOutcome => {
      const { refresh } = optionsRef.current;
      const lifecycleError = lifecycleErrorForPending(event.envelope, pendingRef.current);
      if (lifecycleError) {
        if (lifecycleError.code === "lifecycle_conflict") {
          const activeDetail = lifecycleError.activeRunId ? ` Run ativa: ${lifecycleError.activeRunId}.` : "";
          markPendingConflict(`${lifecycleError.message}${activeDetail}`);
        } else {
          clearPending();
          setNotice(`${lifecycleError.message} A run ${lifecycleError.requestedRunId ?? "desconhecida"} não pode ser reiniciada.`);
        }
        refresh();
        return { consumed: true, capture: false };
      }

      const lifecycle = lifecycleSummaryFromEvent(event);
      if (!lifecycle) {
        return { consumed: false, capture: false };
      }

      const pendingBefore = pendingRef.current;
      const isPendingRecovery =
        pendingBefore?.purpose === "recovery" && pendingBefore.event === "ended" && pendingBefore.runId === lifecycle.runId;
      const isReconciledRecovery = reconciledRecoveryRunIdRef.current === lifecycle.runId;
      if (lifecycle.event === "ended" && (isPendingRecovery || isReconciledRecovery)) {
        clearPending("ended", lifecycle.runId);
        reconciledRecoveryRunIdRef.current = null;
        setRecoveryConfirmRunId(null);
        setNotice(`A run ${lifecycle.runId} foi encerrada. Inicie a próxima experiência quando estiver pronto.`);
        refresh();
        return { consumed: true, capture: false };
      }

      const result = applyExperienceLifecycleEvent(runRef.current, lifecycle);
      if (result.applied) {
        setRun(result.run);
        setWasRestored(false);
      } else if (result.conflict) {
        setNotice(result.conflict);
      }
      const belongsToRun = lifecycle.runId === runRef.current.runId;

      if (pendingBefore && pendingBefore.runId !== lifecycle.runId && belongsToRun) {
        clearPending();
        setNotice(`O lifecycle local ${pendingBefore.runId} foi substituído pela run ativa ${lifecycle.runId}.`);
      } else {
        if (result.applied) {
          setNotice(null);
        }
        clearPending(lifecycle.event, lifecycle.runId);
      }
      return { consumed: false, capture: result.applied || belongsToRun };
    },
    [clearPending, markPendingConflict, optionsRef, runRef, setRun],
  );

  const handleDisconnect = useCallback(() => {
    const current = pendingRef.current;
    if (current?.phase === "conflict") {
      setNotice("A confirmação do lifecycle foi interrompida, e o conflito de run ativa continua bloqueado após a desconexão.");
    } else if (current) {
      markPendingUncertain(
        "A confirmação do lifecycle foi interrompida porque o WebSocket do hub desconectou. Reconecte e tente de novo com o mesmo run id.",
      );
    }
  }, [markPendingUncertain]);

  const reconcileWithStatus = useCallback(
    (nextStatus: StatusResponse) => {
      const current = pendingRef.current;
      if (!current) {
        return;
      }
      if (canReconcileCompletedRecovery(current, nextStatus)) {
        reconciledRecoveryRunIdRef.current = current.runId;
        clearPending("ended", current.runId);
        setRecoveryConfirmRunId(null);
        setNotice(
          `A run ${current.runId} não está mais ativa e seus sensores foram desvinculados. Inicie a próxima experiência quando estiver pronto.`,
        );
        return;
      }
      const conflict = lifecycleTransitionConflict(current, activeExperienceRunId(nextStatus));
      if (conflict) {
        markPendingConflict(conflict);
      }
    },
    [clearPending, markPendingConflict],
  );

  // O estado observado em unreal.state pausa/retoma o relógio da experiência.
  useEffect(() => {
    const receivedAt = sessionState.receivedAt;
    if (!receivedAt) {
      return;
    }
    const current = runRef.current;
    const next =
      sessionState.state === "paused"
        ? pauseExperienceRun(current, receivedAt)
        : sessionState.state === "running"
          ? resumeExperienceRun(current, receivedAt)
          : current;
    if (next !== current) {
      setRun(next);
    }
  }, [runRef, sessionState.receivedAt, sessionState.state, setRun]);

  useEffect(() => clearConfirmTimeout, [clearConfirmTimeout]);

  const hubActiveRunId = useMemo(() => activeExperienceRunId(status), [status]);
  const activeRunConflictId = useMemo(() => {
    const startIsBeingConfirmed =
      pending?.event === "started" && pending.runId === hubActiveRunId && pending.phase !== "conflict";
    return startIsBeingConfirmed ? null : unmatchedActiveRunId(run, hubActiveRunId);
  }, [hubActiveRunId, pending, run]);

  return {
    run,
    wasRestored,
    notice,
    pending,
    activeRunConflictId,
    recoveryConfirmRunId,
    start,
    end,
    requestRecovery,
    confirmRecovery,
    cancelRecovery,
    dismissNotice,
    handleStreamEvent,
    handleDisconnect,
    reconcileWithStatus,
  };
}
