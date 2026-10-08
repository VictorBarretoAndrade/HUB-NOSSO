import { Metric } from "../../components/Metric";
import { StatusPill } from "../../components/StatusPill";
import { formatSensorAge, formatSensorDelay, sensorSignalLabel, sensorSignalTone } from "../../domain/sensorTelemetry";
import type { SensorTelemetrySummary } from "../../domain/sensorTelemetry";
import type { HubClient } from "../../domain/types";
import { formatBpm, formatRrMs, formatSamplesPerMinute } from "../../lib/format";

interface SensorClientDetailProps {
  client: HubClient;
  summary: SensorTelemetrySummary | null;
}

/** Telemetria detalhada de um cliente com papel "sensor". */
export function SensorClientDetail({ client, summary }: SensorClientDetailProps) {
  const signalState = summary?.signalState ?? "unknown";
  const subscriptionCount = client.subscriptions.length;

  return (
    <div className="sensor-detail-block">
      <div className="sensor-detail-header">
        <StatusPill tone={sensorSignalTone(signalState)} label={sensorSignalLabel(signalState)} />
        <span className="mono">
          {subscriptionCount === 0
            ? "apenas publica"
            : `${subscriptionCount} ${subscriptionCount === 1 ? "assinatura" : "assinaturas"}`}
        </span>
      </div>
      <Metric label="BPM" value={formatBpm(summary?.bpm)} />
      <Metric label="RR" value={formatRrMs(summary?.rrMs)} />
      <Metric label="Amostras IBI" value={summary?.ibiSampleCount ?? "--"} />
      <Metric label="Último tópico" value={summary?.topic ?? "--"} small />
      <Metric label="Última amostra" value={formatSensorAge(summary?.lastSampleAgeMs)} small />
      <Metric label="Atraso até o hub" value={formatSensorDelay(summary?.transportDelayMs)} small />
      <Metric label="Falhas de sequência" value={summary?.sequenceGapCount ?? 0} small />
      <Metric label="Amostras/min" value={formatSamplesPerMinute(summary?.samplesPerMinute)} small />
    </div>
  );
}
