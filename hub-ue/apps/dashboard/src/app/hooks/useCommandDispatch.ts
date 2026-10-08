import { useCallback, useState } from "react";
import type { RefObject } from "react";
import { buildSensorCommand, buildUnrealCommand, COMMAND_TIMEOUT_MS, publishCommand } from "../../domain/api";
import type { CommandDispatchResult, SensorCommandAction, UnrealCommandAction } from "../../domain/api";
import { completeCommandHistoryItem, createPendingCommandHistoryItem } from "../../domain/commandHistory";
import type { CommandHistoryItem } from "../../domain/commandHistory";
import { activeExperienceRunId } from "../../domain/experienceLifecycle";
import type { ExperienceRunState } from "../../domain/experienceRun";
import type { MessageEnvelope, StatusResponse } from "../../domain/types";
import { useLatestRef } from "../../lib/useLatestRef";

type CommandChannel = "unreal" | "sensor";
type CommandArguments = Record<string, unknown>;
type CommandOutcome = Pick<CommandDispatchResult, "status" | "ack" | "detail">;

const DEFAULT_ARGUMENTS: CommandArguments = { reason: "dashboard" };

export interface CommandDispatchOptions {
  endpoint: string;
  token: string;
  status: StatusResponse | null;
  runRef: RefObject<ExperienceRunState>;
  initialHistory: CommandHistoryItem[];
  initialOperationalHistory: CommandHistoryItem[];
  /** Chamado ao fim de cada comando para atualizar o retrato do hub. */
  onSettled: () => void;
}

export interface CommandDispatch {
  /** Histórico completo da experiência (alimenta o relatório). */
  history: CommandHistoryItem[];
  /** Histórico visível na aba Histórico; pode ser limpo sem afetar o relatório. */
  operationalHistory: CommandHistoryItem[];
  isDispatchingUnreal: boolean;
  isDispatchingSensor: boolean;
  dispatchUnreal: (action: UnrealCommandAction, commandArguments?: CommandArguments) => void;
  dispatchSensor: (action: SensorCommandAction, commandArguments?: CommandArguments) => void;
  clearOperationalHistory: () => void;
}

/** Run à qual o comando pertence no momento do envio (argumento explícito > hub > run local ativa). */
function commandRunIdAtDispatch(
  commandArguments: CommandArguments,
  status: StatusResponse | null,
  run: ExperienceRunState,
): string | undefined {
  const explicitRunId = commandArguments.runId;
  if (typeof explicitRunId === "string" && explicitRunId.trim()) {
    return explicitRunId.trim();
  }
  const hubRunId = activeExperienceRunId(status);
  if (hubRunId) {
    return hubRunId;
  }
  if ((run.status === "running" || run.status === "paused") && run.runId) {
    return run.runId;
  }
  return undefined;
}

/** Envia comandos com ACK para Unreal e para o Sensor Manager, mantendo o histórico. */
export function useCommandDispatch(options: CommandDispatchOptions): CommandDispatch {
  const [history, setHistory] = useState<CommandHistoryItem[]>(options.initialHistory);
  const [operationalHistory, setOperationalHistory] = useState<CommandHistoryItem[]>(options.initialOperationalHistory);
  const [activeChannels, setActiveChannels] = useState<Record<CommandChannel, boolean>>({ unreal: false, sensor: false });
  const optionsRef = useLatestRef(options);

  const updateHistories = useCallback((update: (items: CommandHistoryItem[]) => CommandHistoryItem[]) => {
    setHistory(update);
    setOperationalHistory(update);
  }, []);

  const recordOutcome = useCallback(
    (messageId: string, outcome: CommandOutcome) => {
      const completedAt = new Date().toISOString();
      updateHistories((items) =>
        items.map((item) =>
          item.messageId === messageId
            ? completeCommandHistoryItem(item, { status: outcome.status, ack: outcome.ack, completedAt, detail: outcome.detail })
            : item,
        ),
      );
    },
    [updateHistories],
  );

  const dispatch = useCallback(
    async (channel: CommandChannel, command: MessageEnvelope, commandArguments: CommandArguments) => {
      const { endpoint, token, status, runRef, onSettled } = optionsRef.current;
      const messageId = command.id ?? "untracked";
      const runId = commandRunIdAtDispatch(commandArguments, status, runRef.current);
      const pendingItem = createPendingCommandHistoryItem(command, new Date().toISOString(), runId);

      updateHistories((items) => [pendingItem, ...items]);
      setActiveChannels((current) => ({ ...current, [channel]: true }));
      try {
        const result = await publishCommand(endpoint, token, command, COMMAND_TIMEOUT_MS, (lateResult) =>
          recordOutcome(messageId, lateResult),
        );
        recordOutcome(messageId, result);
      } catch (cause) {
        recordOutcome(messageId, {
          status: "failed",
          ack: null,
          detail: cause instanceof Error ? cause.message : "Falha ao enviar o comando.",
        });
      } finally {
        setActiveChannels((current) => ({ ...current, [channel]: false }));
        onSettled();
      }
    },
    [optionsRef, recordOutcome, updateHistories],
  );

  const dispatchUnreal = useCallback(
    (action: UnrealCommandAction, commandArguments: CommandArguments = DEFAULT_ARGUMENTS) => {
      void dispatch("unreal", buildUnrealCommand({ action, arguments: commandArguments }), commandArguments);
    },
    [dispatch],
  );

  const dispatchSensor = useCallback(
    (action: SensorCommandAction, commandArguments: CommandArguments = DEFAULT_ARGUMENTS) => {
      void dispatch("sensor", buildSensorCommand({ action, arguments: commandArguments }), commandArguments);
    },
    [dispatch],
  );

  const clearOperationalHistory = useCallback(() => setOperationalHistory([]), []);

  return {
    history,
    operationalHistory,
    isDispatchingUnreal: activeChannels.unreal,
    isDispatchingSensor: activeChannels.sensor,
    dispatchUnreal,
    dispatchSensor,
    clearOperationalHistory,
  };
}
