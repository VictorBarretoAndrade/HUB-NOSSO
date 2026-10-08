import { StatusPill } from "../../components/StatusPill";
import type { ExperienceReportHealth } from "../../domain/experienceReport";
import { formatBpmRange, formatReportMs } from "../../lib/format";
import { ReportMetric } from "./ReportMetric";

/** Veredito de qualidade do relatório e os números que o justificam. */
export function ReportHealthStrip({ health }: { health: ExperienceReportHealth }) {
  const { metrics } = health;

  return (
    <div className={`report-health-strip ${health.tone}`}>
      <div className="report-health-main">
        <StatusPill tone={health.tone} label={health.label} />
        <span>{health.details.join(" ")}</span>
      </div>
      <div className="report-health-metrics">
        <ReportMetric label="Amostras" value={metrics.biometricSampleCount} />
        <ReportMetric label="BPM mín/méd/máx" value={formatBpmRange(metrics.bpmMin, metrics.bpmAvg, metrics.bpmMax)} />
        <ReportMetric label="RR médio" value={formatReportMs(metrics.rrAvgMs)} />
        <ReportMetric label="Markers" value={metrics.markerCount} />
        <ReportMetric label="Falhas / sinal ruim" value={`${metrics.sensorGapCount} / ${metrics.poorSignalCount}`} />
        <ReportMetric label="Problemas em comandos" value={metrics.commandIssueCount} />
      </div>
    </div>
  );
}
