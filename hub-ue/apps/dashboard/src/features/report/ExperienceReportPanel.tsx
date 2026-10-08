import { Download } from "lucide-react";
import { useState } from "react";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import { commandIssueCount, deriveExperienceReportHealth } from "../../domain/experienceReport";
import type { ExperienceReport } from "../../domain/experienceReport";
import { formatExperienceTime } from "../../domain/experienceRun";
import { sensorSignalLabel } from "../../domain/sensorTelemetry";
import { formatBpmRange, formatDateTime, formatReportMs, formatReportNumber, formatTime } from "../../lib/format";
import { BiometricTimelineChart } from "./BiometricTimelineChart";
import { ReportChip } from "./ReportChip";
import type { ReportCsvKind, ReportFormat } from "./reportExports";
import { ReportHealthStrip } from "./ReportHealthStrip";
import { UnrealTelemetryChart } from "./UnrealTelemetryChart";

interface ExperienceReportPanelProps {
  report: ExperienceReport;
  timelineItemCount: number;
  onExportReport: (format: ReportFormat) => void;
  onExportReportCsv: (kind: ReportCsvKind) => void;
  onExportTimeline: () => void;
}

function sampleCountLabel(count: number): string {
  return count === 1 ? "1 amostra" : `${count} amostras`;
}

/** Relatório da experiência encerrada: resumo, exportações, gráficos e tabelas. */
export function ExperienceReportPanel({
  onExportReport,
  onExportReportCsv,
  onExportTimeline,
  report,
  timelineItemCount,
}: ExperienceReportPanelProps) {
  const { analytics, biometrics, commands, markers, summary } = report;
  const issueCount = commandIssueCount(commands);
  const [selectedSensorId, setSelectedSensorId] = useState("");
  const selectedSensor = analytics.sensors.find((sensor) => sensor.sensorClientId === selectedSensorId) ?? analytics.sensors[0];
  const telemetrySampleCount = analytics.unrealTelemetry.samples.length;
  const hasBiometricSamples = analytics.sensors.some((sensor) => sensor.samples.length > 0);

  return (
    <>
      <Panel className="report-wide report-summary-panel" title="Relatório da sessão">
        <ReportHealthStrip health={deriveExperienceReportHealth(report)} />
        <div className="report-summary-hero">
          <div className="report-duration-block">
            <span>Duração da experiência</span>
            <strong>{formatExperienceTime(summary.durationMs)}</strong>
          </div>
          <dl className="report-time-list">
            <div>
              <dt>Início</dt>
              <dd>{summary.startedAt ? formatDateTime(summary.startedAt) : "--"}</dd>
            </div>
            <div>
              <dt>Fim</dt>
              <dd>{summary.endedAt ? formatDateTime(summary.endedAt) : "--"}</dd>
            </div>
            <div>
              <dt>Em pausa</dt>
              <dd>{formatExperienceTime(summary.pausedMs)}</dd>
            </div>
          </dl>
        </div>
        <div className="report-chip-row">
          <ReportChip label="Markers" value={summary.markerCount} />
          <ReportChip label="Mudanças de estado" value={summary.stateChangeCount} />
          <ReportChip label="Observações biométricas" value={summary.biometricObservationCount} />
          <ReportChip
            label="Comandos"
            value={commands.total}
            detail={
              issueCount > 0
                ? `${issueCount} ${issueCount === 1 ? "problema" : "problemas"}`
                : `${commands.accepted} ${commands.accepted === 1 ? "aceito" : "aceitos"}`
            }
            tone={issueCount > 0 ? "warn" : "ok"}
          />
        </div>
        <div className="report-export-bar">
          <div role="group" aria-label="Exportações recomendadas">
            <span>Exportações recomendadas</span>
            <button className="mini-button strong" type="button" onClick={() => onExportReport("json")}>
              <Download aria-hidden size={14} /> Relatório JSON
            </button>
            <button
              className="mini-button strong"
              disabled={markers.length === 0}
              title={markers.length === 0 ? "Nenhum marker capturado nesta experiência" : undefined}
              type="button"
              onClick={() => onExportReportCsv("markers")}
            >
              <Download aria-hidden size={14} /> Markers CSV
            </button>
          </div>
          <div role="group" aria-label="Exportações avançadas">
            <span>Avançadas</span>
            <button
              className="mini-button"
              disabled={biometrics.length === 0}
              title={biometrics.length === 0 ? "Nenhuma amostra biométrica capturada" : undefined}
              type="button"
              onClick={() => onExportReportCsv("biometrics")}
            >
              <Download aria-hidden size={14} /> Biometria CSV
            </button>
            <button
              className="mini-button"
              disabled={!hasBiometricSamples}
              title={hasBiometricSamples ? undefined : "Nenhuma amostra biométrica capturada"}
              type="button"
              onClick={() => onExportReportCsv("biometrics-timeline")}
            >
              <Download aria-hidden size={14} /> Biometria no tempo CSV
            </button>
            <button
              className="mini-button"
              disabled={timelineItemCount === 0}
              title={timelineItemCount === 0 ? "A timeline desta experiência está vazia" : undefined}
              type="button"
              onClick={onExportTimeline}
            >
              <Download aria-hidden size={14} /> Timeline CSV ({timelineItemCount})
            </button>
          </div>
        </div>
        <p className="muted-copy table-footnote">
          O relatório fica salvo apenas neste navegador e é substituído ao iniciar a próxima experiência. Exporte os
          arquivos de que precisa.
        </p>
      </Panel>

      <Panel
        className="report-wide unreal-telemetry-panel"
        title="Telemetria do Unreal"
        action={
          <StatusPill
            tone={telemetrySampleCount > 0 ? "ok" : "muted"}
            label={telemetrySampleCount > 0 ? sampleCountLabel(telemetrySampleCount) : "Sem telemetria"}
          />
        }
      >
        <UnrealTelemetryChart analytics={analytics} durationMs={summary.durationMs} />
      </Panel>

      <Panel
        className="report-wide biometric-chart-panel"
        title="Biometria ao longo da experiência"
        action={
          <StatusPill
            tone={selectedSensor && selectedSensor.samples.length > 0 ? "ok" : "muted"}
            label={selectedSensor ? sampleCountLabel(selectedSensor.samples.length) : "Sem amostras"}
          />
        }
      >
        <BiometricTimelineChart
          analytics={analytics}
          durationMs={summary.durationMs}
          selectedSensorId={selectedSensor?.sensorClientId ?? ""}
          sensors={analytics.sensors}
          onSelectSensor={setSelectedSensorId}
        />
      </Panel>

      <Panel className="report-wide" title="Resumo da biometria">
        {biometrics.length === 0 ? (
          <p className="empty-state">Nenhuma amostra biométrica capturada nesta experiência.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table report-table">
              <thead>
                <tr>
                  <th scope="col">Sensor</th>
                  <th scope="col">Amostras</th>
                  <th scope="col">BPM mín/méd/máx</th>
                  <th scope="col">RR médio</th>
                  <th scope="col">IBI total</th>
                  <th scope="col">Sinal ruim</th>
                  <th scope="col">Falhas</th>
                  <th scope="col">Janela</th>
                </tr>
              </thead>
              <tbody>
                {biometrics.map((sensor) => (
                  <tr key={sensor.sensorClientId}>
                    <td className="mono">{sensor.sensorClientId}</td>
                    <td>{sensor.sampleCount}</td>
                    <td className="mono">{formatBpmRange(sensor.bpmMin, sensor.bpmAvg, sensor.bpmMax)}</td>
                    <td className="mono">{formatReportMs(sensor.rrAvgMs)}</td>
                    <td>{sensor.ibiSampleCount}</td>
                    <td>{sensor.poorObservationCount}</td>
                    <td>{sensor.gapObservationCount}</td>
                    <td>
                      <span className="subtle-line">{sensor.firstSampleAt ? formatTime(sensor.firstSampleAt) : "--"}</span>
                      <span className="subtle-line">{sensor.lastSampleAt ? formatTime(sensor.lastSampleAt) : "--"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="report-wide" title="Markers e biometria no instante">
        {markers.length === 0 ? (
          <p className="empty-state">Nenhum marker capturado nesta experiência.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table report-table">
              <thead>
                <tr>
                  <th scope="col">Tempo de experiência</th>
                  <th scope="col">Rótulo</th>
                  <th scope="col">Origem</th>
                  <th scope="col">BPM</th>
                  <th scope="col">RR</th>
                  <th scope="col">Sinal</th>
                  <th scope="col">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {markers.map((marker) => (
                  <tr key={marker.id}>
                    <td className="mono">{formatExperienceTime(marker.experienceTimeMs)}</td>
                    <td>{marker.label}</td>
                    <td className="mono">{marker.source ?? marker.sourceClientId}</td>
                    <td className="mono">{formatReportNumber(marker.bpm)}</td>
                    <td className="mono">{formatReportMs(marker.rrMs)}</td>
                    <td>{marker.sensorSignal ? sensorSignalLabel(marker.sensorSignal) : "--"}</td>
                    <td>{marker.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {issueCount > 0 && (
        <Panel className="report-wide" title="Problemas em comandos">
          <div className="report-command-line">
            <span>{commands.total} no total</span>
            <span>{commands.accepted} aceitos</span>
            <span>{commands.rejected} rejeitados</span>
            <span>{commands.timeout} sem resposta</span>
            <span>{commands.failed} com falha</span>
            <span>{commands.pending} pendentes</span>
          </div>
        </Panel>
      )}
    </>
  );
}
