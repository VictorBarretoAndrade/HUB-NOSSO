import { StatusPill } from "../../components/StatusPill";
import { sensorStateLabel, sensorStateTone } from "../../domain/sensorManager";
import type { ManagedSensorView } from "../../domain/sensorManager";
import { formatSensorAge, formatSensorDelay, sensorSignalLabel, sensorSignalTone } from "../../domain/sensorTelemetry";
import type { SensorDataStreamSnapshot, SensorTelemetrySummary } from "../../domain/sensorTelemetry";
import { primarySensorSummary } from "../../domain/sessionControlUi";
import { formatBpm, formatRrMs } from "../../lib/format";
import { distinctSensorCount } from "../sensors/sensorHelpers";
import { SensorMetric } from "../sensors/SensorMetric";

interface SensorOverviewStripProps {
  dataStream: SensorDataStreamSnapshot;
  managedSensors: ManagedSensorView[];
  /** Sensor escolhido pelo operador; vazio ou inexistente cai no sensor principal. */
  selectedSensorId: string;
  summaries: SensorTelemetrySummary[];
  onSelectSensor: (sensorId: string) => void;
}

/** Resumo do sensor em foco na Visão geral: sinal, última amostra e atraso até o hub. */
export function SensorOverviewStrip({
  dataStream,
  managedSensors,
  onSelectSensor,
  selectedSensorId,
  summaries,
}: SensorOverviewStripProps) {
  const sensor = summaries.find((summary) => summary.clientId === selectedSensorId) ?? primarySensorSummary(summaries);
  const managedSensor = managedSensors.find((candidate) => candidate.state !== "disconnected") ?? managedSensors[0];
  const totalSensorCount = distinctSensorCount(summaries, managedSensors);

  if (sensor) {
    const latestRow = dataStream.rows.find((row) => row.clientId === sensor.clientId);
    const hasHeartMetrics = typeof sensor.bpm === "number" || typeof sensor.rrMs === "number";
    return (
      <div className={`sensor-overview-strip ${sensor.signalState}`}>
        <div className="sensor-headline">
          <span>Prontidão do sensor</span>
          <strong>{sensor.device ?? sensor.clientId}</strong>
          <StatusPill tone={sensorSignalTone(sensor.signalState)} label={sensorSignalLabel(sensor.signalState)} />
          {summaries.length > 1 && (
            <label className="sensor-selector">
              <span>Exibindo</span>
              <select value={sensor.clientId} onChange={(event) => onSelectSensor(event.target.value)}>
                {summaries.map((summary) => (
                  <option key={summary.clientId} value={summary.clientId}>
                    {summary.device ?? summary.clientId}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="sensor-mini-grid">
          <SensorMetric label="Sensores" value={totalSensorCount} />
          {hasHeartMetrics ? (
            <>
              <SensorMetric label="BPM" value={formatBpm(sensor.bpm)} />
              <SensorMetric label="RR" value={formatRrMs(sensor.rrMs)} />
            </>
          ) : (
            <>
              <SensorMetric label="Medição" value={latestRow?.measurement ?? "--"} />
              <SensorMetric label="Tópico" value={latestRow?.topic ?? sensor.topic ?? "--"} />
            </>
          )}
          <SensorMetric label="Última amostra" value={formatSensorAge(sensor.lastSampleAgeMs)} />
          <SensorMetric label="Atraso até o hub" value={formatSensorDelay(sensor.transportDelayMs)} />
          <SensorMetric label="Falhas de sequência" value={sensor.sequenceGapCount ?? 0} />
        </div>
      </div>
    );
  }

  if (managedSensor) {
    return (
      <div className={`sensor-overview-strip ${managedSensor.state}`}>
        <div className="sensor-headline">
          <span>Prontidão do sensor</span>
          <strong>{managedSensor.displayName}</strong>
          <StatusPill tone={sensorStateTone(managedSensor.state)} label={sensorStateLabel(managedSensor.state)} />
        </div>
        <div className="sensor-mini-grid">
          <SensorMetric label="Sensores" value={totalSensorCount} />
          <SensorMetric label="Origem" value={managedSensor.source} />
          <SensorMetric label="Preview" value={formatSensorAge(managedSensor.previewAgeMs)} />
          <SensorMetric label="Atraso até o hub" value="--" />
          <SensorMetric label="Falhas de sequência" value="--" />
        </div>
      </div>
    );
  }

  return (
    <div className="sensor-overview-strip empty">
      <div className="sensor-headline">
        <span>Prontidão do sensor</span>
        <strong>Nenhum sensor conectado</strong>
      </div>
      <p className="muted-copy">
        Conecte um sensor WebSocket ou adaptador de HRV para ver a biometria ao vivo. Sem hardware, use o simulador:{" "}
        <code>biofeedback-sim --mode hrv-ecg</code>.
      </p>
    </div>
  );
}
