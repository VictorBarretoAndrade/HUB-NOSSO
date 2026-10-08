import { useCallback, useEffect, useMemo, useRef } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ToastRegion } from "../components/ToastRegion";
import type { SessionControlTab } from "../domain/sessionControlUi";
import { ClientsView } from "../features/clients/ClientsView";
import { DiagnosticsView } from "../features/diagnostics/DiagnosticsView";
import { GuideView } from "../features/guide/GuideView";
import { LiveView } from "../features/live/LiveView";
import { OverviewView } from "../features/overview/OverviewView";
import { RecordingModeView } from "../features/recording/RecordingModeView";
import { SessionControlView } from "../features/session/SessionControlView";
import { SubjectView } from "../features/subject/SubjectView";
import { TopicsView } from "../features/topics/TopicsView";
import { ConnectionBanner } from "./ConnectionBanner";
import { useHashRoute } from "./hooks/useHashRoute";
import { navItem } from "./navigation";
import type { View } from "./navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useDashboard } from "./useDashboard";

export function App() {
  const dashboard = useDashboard();
  const [route, navigate] = useHashRoute();
  const mainRef = useRef<HTMLElement>(null);
  const activeItem = navItem(route.view);
  const { hub, socket, setup, settings, clients } = dashboard;

  const navigateToView = useCallback((view: View) => navigate({ view }), [navigate]);
  const navigateToSessionTab = useCallback(
    (sessionTab: SessionControlTab) => navigate({ view: "session", sessionTab }),
    [navigate],
  );

  useEffect(() => {
    document.title = `${activeItem.title} · Biofeedback Hub`;
  }, [activeItem.title]);

  const retryConnection = useCallback(() => {
    void hub.refresh();
    socket.reconnect();
  }, [hub, socket]);

  // Sensores conhecidos pelo hub mais os já presentes no perfil de captura salvo.
  const recordingSensorIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...clients.filter((client) => client.role === "sensor").map((client) => client.clientId),
          ...setup.capture.sensors.map((sensor) => sensor.clientId),
        ]),
      ),
    [clients, setup.capture.sensors],
  );

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#conteudo"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <Sidebar activeView={route.view} hubEndpoint={settings.endpoint} onNavigate={navigateToView} />

      <main className="main-frame" id="conteudo" ref={mainRef} tabIndex={-1}>
        <Topbar
          linkState={hub.linkState}
          pendingAckCount={hub.status?.pendingAckCount ?? hub.health?.pendingAcks ?? 0}
          sessionId={hub.health?.sessionId}
          socketState={socket.state}
          title={activeItem.title}
          onRefresh={() => void hub.refresh()}
        />
        <ConnectionBanner
          hubError={hub.error}
          linkState={hub.linkState}
          socketError={socket.error}
          socketState={socket.state}
          onOpenDiagnostics={() => navigateToView("diagnostics")}
          onRetry={retryConnection}
        />

        <ErrorBoundary key={route.view}>
          {route.view === "overview" && (
            <OverviewView
              actions={dashboard.actions}
              clients={clients}
              events={dashboard.events}
              health={hub.health}
              latestMarker={dashboard.latestMarker}
              linkState={hub.linkState}
              managedSensors={dashboard.managedSensors}
              readiness={dashboard.readiness}
              sensorDataStream={dashboard.sensorDataStream}
              sensorSummaries={dashboard.sensorSummaries}
              sessionState={dashboard.sessionState}
              status={hub.status}
              onExportSensorDataJson={dashboard.exportSensorDataStream}
              onNavigate={navigateToView}
              onRefresh={() => void hub.refresh()}
            />
          )}
          {route.view === "subject" && (
            <SubjectView
              profile={setup.subject}
              onChange={setup.setSubject}
              onClear={setup.clearSubject}
              onNavigate={navigateToView}
              notify={dashboard.notify}
            />
          )}
          {route.view === "recording" && (
            <RecordingModeView
              capture={setup.capture}
              sensors={recordingSensorIds}
              onChange={setup.setCapture}
              onNavigate={navigateToView}
              onReset={setup.resetCapture}
            />
          )}
          {route.view === "session" && (
            <SessionControlView
              activeTab={route.sessionTab}
              dashboard={dashboard}
              onNavigate={navigateToView}
              onTabChange={navigateToSessionTab}
            />
          )}
          {route.view === "live" && <LiveView events={dashboard.events} onNavigate={navigateToView} />}
          {route.view === "clients" && (
            <ClientsView
              clients={clients}
              sensorSummaries={dashboard.sensorSummaries}
              totalCount={hub.status?.clientCount ?? clients.length}
            />
          )}
          {route.view === "topics" && <TopicsView events={dashboard.events} socketState={socket.state} />}
          {route.view === "diagnostics" && (
            <DiagnosticsView
              health={hub.health}
              hubError={hub.error}
              linkState={hub.linkState}
              notify={dashboard.notify}
              settings={settings}
              socketState={socket.state}
              status={hub.status}
            />
          )}
          {route.view === "guide" && <GuideView onNavigate={navigateToView} />}
        </ErrorBoundary>
      </main>

      <ToastRegion toasts={dashboard.toasts} onDismiss={dashboard.dismissToast} />
    </div>
  );
}
