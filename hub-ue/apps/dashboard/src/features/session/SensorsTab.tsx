import { Download } from "lucide-react";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type { SensorCommandAction } from "../../domain/api";
import type { ExperienceRunState } from "../../domain/experienceRun";
import { hasOfficialLslRecording, hasSensorManager } from "../../domain/sensorManager";
import type { ManagedSensorView } from "../../domain/sensorManager";
import type { SensorTelemetrySummary } from "../../domain/sensorTelemetry";
import type { StatusResponse } from "../../domain/types";
import { SensorListPanel } from "../sensors/SensorListPanel";
import { SensorManagerPanel } from "../sensors/SensorManagerPanel";

interface SensorsTabProps {
  isDispatching: boolean;
  managedSensors: ManagedSensorView[];
  run: ExperienceRunState;
  sensorSummaries: SensorTelemetrySummary[];
  status: StatusResponse | null;
  onExportSensorDataJson: () => void;
  onSensorCommand: (action: SensorCommandAction, commandArguments?: Record<string, unknown>) => void;
}

function exportHint(hasTelemetry: boolean, lslLoggingActive: boolean): string | undefined {
  if (hasTelemetry) {
    return undefined;
  }
  return lslLoggingActive
    ? "Os lotes oficiais de LSL ficam gravados no JSONL do hub"
    : "Disponível quando houver telemetria de sensor observada";
}

export function SensorsTab({
  isDispatching,
  managedSensors,
  onExportSensorDataJson,
  onSensorCommand,
  run,
  sensorSummaries,
  status,
}: SensorsTabProps) {
  const managerOnline = hasSensorManager(status);
  const lslLoggingActive = hasOfficialLslRecording(managedSensors);
  const hasTelemetry = sensorSummaries.length > 0;

  return (
    <Panel
      title="Sensores"
      action={
        <div className="panel-actions">
          <StatusPill
            tone={managerOnline ? "ok" : "warn"}
            label={managerOnline ? "Sensor Manager online" : "Sensor Manager indisponível"}
          />
          {lslLoggingActive && <StatusPill tone="ok" label="Gravação LSL ativa" />}
          <button
            className="mini-button strong"
            disabled={!hasTelemetry}
            title={exportHint(hasTelemetry, lslLoggingActive)}
            type="button"
            onClick={onExportSensorDataJson}
          >
            <Download aria-hidden size={14} /> Exportar JSON
          </button>
        </div>
      }
    >
      <SensorManagerPanel
        isDispatching={isDispatching}
        run={run}
        sensors={managedSensors}
        status={status}
        onCommand={onSensorCommand}
      />
      <SensorListPanel summaries={sensorSummaries} showEmptyState={managedSensors.length === 0} />
    </Panel>
  );
}
