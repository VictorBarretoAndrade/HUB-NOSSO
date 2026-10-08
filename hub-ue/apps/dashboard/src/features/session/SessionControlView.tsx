import { useEffect, useMemo, useRef, useState } from "react";
import type { View } from "../../app/navigation";
import type { Dashboard } from "../../app/useDashboard";
import {
  canDispatchPauseSession,
  canDispatchResumeSession,
  commandObservation,
  commandObservedStateDetail,
  commandRecipients,
} from "../../domain/commandHistory";
import { commandHistoryForRun, deriveExperienceReport } from "../../domain/experienceReport";
import { deriveAnalyticSessionTimeline, summarizeExperienceRun } from "../../domain/experienceRun";
import { summarizeRunHeader } from "../../domain/sessionControlUi";
import type { SessionControlTab } from "../../domain/sessionControlUi";
import { downloadTextFile } from "../../lib/download";
import { ExperienceReportPanel } from "../report/ExperienceReportPanel";
import { buildReportCsvFile, buildReportFile, buildTimelineCsvFile } from "../report/reportExports";
import type { ExportFile } from "../report/reportExports";
import { distinctSensorCount } from "../sensors/sensorHelpers";
import { CommandConfirmDialog } from "./CommandConfirmDialog";
import type { SessionStateCommand } from "./CommandConfirmDialog";
import { CommandHistoryTab } from "./CommandHistoryTab";
import { ExperienceConfirmDialog } from "./ExperienceConfirmDialog";
import type { ExperienceConfirmation } from "./ExperienceConfirmDialog";
import { ExperienceRunHeader } from "./ExperienceRunHeader";
import { LifecycleRecoveryDialog } from "./LifecycleRecoveryDialog";
import { OperateTab } from "./OperateTab";
import { SensorsTab } from "./SensorsTab";
import { SessionAlerts } from "./SessionAlerts";
import { SessionControlTabs, sessionTabId, sessionTabPanelId } from "./SessionControlTabs";
import { TimelineTab } from "./TimelineTab";

const TIMELINE_ITEM_LIMIT = 200;
const CLOCK_TICK_MS = 1000;

interface SessionControlViewProps {
  /** Aba pedida pela URL; ausente usa a aba natural do momento da experiência. */
  activeTab?: SessionControlTab;
  dashboard: Dashboard;
  onNavigate: (view: View) => void;
  onTabChange: (tab: SessionControlTab) => void;
}

export function SessionControlView({ activeTab, dashboard, onNavigate, onTabChange }: SessionControlViewProps) {
  const { commands, experienceEvents, hub, lifecycle, managedSensors, notify, sensorSummaries, sessionState, setup, socket } =
    dashboard;
  const { status } = hub;
  const { run, pending: pendingLifecycle } = lifecycle;
  const [commandToConfirm, setCommandToConfirm] = useState<SessionStateCommand | null>(null);
  const [experienceConfirmation, setExperienceConfirmation] = useState<ExperienceConfirmation | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date().toISOString());

  const experienceIsActive = run.status === "running" || run.status === "paused";
  const experienceHasEnded = run.status === "ended";
  const clients = dashboard.clients;
  const commandClients = commandRecipients(clients);
  const isDispatching = commands.isDispatchingUnreal;
  const canPause = run.status === "running" && canDispatchPauseSession(clients, isDispatching, sessionState);
  const canResume = run.status === "paused" && canDispatchResumeSession(clients, isDispatching, sessionState);

  const timeline = useMemo(
    () => deriveAnalyticSessionTimeline(experienceEvents, run, TIMELINE_ITEM_LIMIT),
    [experienceEvents, run],
  );
  const runSummary = useMemo(() => summarizeExperienceRun(run, timeline, clockNow), [clockNow, run, timeline]);
  const runHeader = useMemo(
    () => summarizeRunHeader(run, sessionState, sensorSummaries, managedSensors),
    [managedSensors, run, sensorSummaries, sessionState],
  );
  const reportCommandHistory = useMemo(() => commandHistoryForRun(run, commands.history), [commands.history, run]);
  const report = useMemo(
    () => deriveExperienceReport(run, timeline, experienceEvents, reportCommandHistory),
    [experienceEvents, reportCommandHistory, run, timeline],
  );

  const awaitedCommand = commands.operationalHistory.find(
    (item) => commandObservation(item, sessionState, experienceEvents) === "awaiting",
  );
  const sensorCleanupPending = managedSensors.some((sensor) => Boolean(sensor.attachedRunId));
  const startBlockedReason = lifecycle.activeRunConflictId
    ? `Encerre a run ${lifecycle.activeRunConflictId}, ainda ativa no hub, antes de iniciar outra experiência.`
    : socket.state !== "connected"
      ? "Sem conexão em tempo real com o hub. Aguarde a reconexão para iniciar."
      : pendingLifecycle && pendingLifecycle.phase !== "uncertain"
        ? "Aguardando o hub confirmar o lifecycle."
        : commands.isDispatchingSensor
          ? "Aguarde a confirmação do comando de sensor."
          : sensorCleanupPending
            ? "Aguardando os sensores se desvincularem da run anterior."
            : undefined;

  // A aba Relatório só existe com a experiência encerrada; fora disso cai em Operação.
  const defaultTab: SessionControlTab = experienceHasEnded ? "report" : "operate";
  const currentTab = activeTab && (activeTab !== "report" || experienceHasEnded) ? activeTab : defaultTab;

  // Ao encerrar, leva o operador direto ao relatório (apenas na transição, não ao recarregar).
  const previousStatusRef = useRef(run.status);
  useEffect(() => {
    if (previousStatusRef.current !== "ended" && run.status === "ended") {
      onTabChange("report");
    }
    previousStatusRef.current = run.status;
  }, [onTabChange, run.status]);

  useEffect(() => {
    if (!experienceIsActive) {
      return;
    }
    const interval = window.setInterval(() => setClockNow(new Date().toISOString()), CLOCK_TICK_MS);
    return () => window.clearInterval(interval);
  }, [experienceIsActive]);

  // O comando em confirmação pode deixar de ser válido (ex.: o estado mudou no stream).
  useEffect(() => {
    if ((commandToConfirm === "pause-session" && !canPause) || (commandToConfirm === "resume-session" && !canResume)) {
      setCommandToConfirm(null);
    }
  }, [canPause, canResume, commandToConfirm]);

  const saveExport = (file: ExportFile) => {
    downloadTextFile(file.filename, file.content, file.mimeType);
    notify(`Arquivo ${file.filename} exportado.`);
  };

  const startExperience = () => {
    setClockNow(new Date().toISOString());
    lifecycle.start();
  };

  const requestStart = () => {
    // Uma tentativa incerta é só um reenvio do mesmo pedido: não precisa confirmar de novo.
    if (pendingLifecycle?.phase === "uncertain" || setup.pendingIssues.length === 0) {
      startExperience();
    } else {
      setExperienceConfirmation("start-with-issues");
    }
  };

  const requestEnd = () => {
    if (pendingLifecycle?.phase === "uncertain") {
      lifecycle.end();
    } else {
      setExperienceConfirmation("end");
    }
  };

  const requestStartNext = () => {
    if (pendingLifecycle?.phase === "uncertain") {
      startExperience();
    } else {
      setExperienceConfirmation("start-next");
    }
  };

  const confirmExperienceTransition = () => {
    const confirmation = experienceConfirmation;
    setExperienceConfirmation(null);
    setClockNow(new Date().toISOString());
    if (confirmation === "end") {
      lifecycle.end();
      return;
    }
    lifecycle.start();
    if (confirmation === "start-next") {
      onTabChange("operate");
    }
  };

  const confirmCommand = () => {
    if (commandToConfirm) {
      commands.dispatchUnreal(commandToConfirm);
      setCommandToConfirm(null);
    }
  };

  const addMarker = (label: string, note: string) => {
    const delivery = dashboard.addMarker(label, note);
    if (delivery === "failed") {
      notify("O marker não foi enviado: sem conexão em tempo real com o hub.", "error");
    } else if (delivery === "annotation") {
      notify(`Marker “${label.trim()}” adicionado à timeline.`);
    }
  };

  return (
    <>
      <section className="content-grid session-grid session-control-layout">
        <div className="section-heading">
          <p>
            Sessão do hub: <span className="mono">{status?.sessionId ?? "indisponível"}</span> · clientes conectados:{" "}
            {status?.clientCount ?? 0}
          </p>
        </div>

        <ExperienceRunHeader
          header={runHeader}
          pendingLifecycle={pendingLifecycle}
          run={run}
          sessionState={sessionState}
          startBlockedReason={startBlockedReason}
          summary={runSummary}
          wasRestored={lifecycle.wasRestored}
          onEnd={requestEnd}
          onStart={requestStart}
          onStartNext={requestStartNext}
        />

        <SessionAlerts
          activeRunConflictId={lifecycle.activeRunConflictId}
          lifecycleNotice={lifecycle.notice}
          pendingLifecycle={pendingLifecycle}
          pendingObservationDetail={
            awaitedCommand ? commandObservedStateDetail(awaitedCommand, sessionState, experienceEvents) : null
          }
          setupIssues={experienceIsActive ? [] : setup.pendingIssues}
          socketState={socket.state}
          onDismissNotice={lifecycle.dismissNotice}
          onNavigate={onNavigate}
          onRequestRecovery={lifecycle.requestRecovery}
        />

        <SessionControlTabs
          activeTab={currentTab}
          commandCount={commands.operationalHistory.length}
          runStatus={run.status}
          sensorCount={distinctSensorCount(sensorSummaries, managedSensors)}
          timelineCount={timeline.length}
          onTabChange={onTabChange}
        />

        <div
          aria-labelledby={sessionTabId(currentTab)}
          className={`session-tab-panel ${currentTab === "operate" ? "operate-tab" : ""} ${currentTab === "report" ? "report-grid" : ""}`.trim()}
          id={sessionTabPanelId(currentTab)}
          role="tabpanel"
        >
          {currentTab === "operate" && (
            <OperateTab
              canPause={canPause}
              canResume={canResume}
              commandClients={commandClients}
              isDispatching={isDispatching}
              runStatus={run.status}
              sessionState={sessionState}
              onAddMarker={addMarker}
              onRequestCommand={setCommandToConfirm}
            />
          )}
          {currentTab === "timeline" && (
            <TimelineTab
              hasUnrealClient={clients.some((client) => client.role === "unreal")}
              runStatus={run.status}
              timeline={timeline}
            />
          )}
          {currentTab === "sensors" && (
            <SensorsTab
              isDispatching={commands.isDispatchingSensor || Boolean(pendingLifecycle)}
              managedSensors={managedSensors}
              run={run}
              sensorSummaries={sensorSummaries}
              status={status}
              onExportSensorDataJson={dashboard.exportSensorDataStream}
              onSensorCommand={commands.dispatchSensor}
            />
          )}
          {currentTab === "history" && (
            <CommandHistoryTab
              commandHistory={commands.operationalHistory}
              events={experienceEvents}
              pendingAcks={status?.pendingAcks ?? []}
              sessionState={sessionState}
              onClearHistory={commands.clearOperationalHistory}
            />
          )}
          {currentTab === "report" && (
            <ExperienceReportPanel
              report={report}
              timelineItemCount={timeline.length}
              onExportReport={(format) =>
                saveExport(
                  buildReportFile(report, format, {
                    timeline,
                    commandHistory: reportCommandHistory,
                    subject: setup.subjectSnapshot,
                    capture: setup.capture,
                  }),
                )
              }
              onExportReportCsv={(kind) => saveExport(buildReportCsvFile(report, kind))}
              onExportTimeline={() => saveExport(buildTimelineCsvFile(run, timeline))}
            />
          )}
        </div>
      </section>

      {commandToConfirm && (
        <CommandConfirmDialog
          action={commandToConfirm}
          recipientCount={commandClients.length}
          onCancel={() => setCommandToConfirm(null)}
          onConfirm={confirmCommand}
        />
      )}
      {experienceConfirmation && (
        <ExperienceConfirmDialog
          kind={experienceConfirmation}
          setupIssues={setup.pendingIssues}
          onCancel={() => setExperienceConfirmation(null)}
          onConfirm={confirmExperienceTransition}
        />
      )}
      {lifecycle.recoveryConfirmRunId && (
        <LifecycleRecoveryDialog
          activeRunId={lifecycle.activeRunConflictId}
          runId={lifecycle.recoveryConfirmRunId}
          socketState={socket.state}
          onCancel={lifecycle.cancelRecovery}
          onConfirm={lifecycle.confirmRecovery}
        />
      )}
    </>
  );
}
