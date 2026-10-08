import { StatusPill } from "../../components/StatusPill";
import { sensorSignalTone } from "../../domain/sensorTelemetry";
import type { SensorTelemetrySummary } from "../../domain/sensorTelemetry";
import { buildSensorListRows } from "../../domain/sessionControlUi";

interface SensorListPanelProps {
  summaries: SensorTelemetrySummary[];
  /** Falso quando outra seção da tela já explica a ausência de sensores. */
  showEmptyState?: boolean;
}

/** Tabela da telemetria observada por sensor (BPM, RR, taxa de amostras). */
export function SensorListPanel({ showEmptyState = true, summaries }: SensorListPanelProps) {
  const rows = buildSensorListRows(summaries);

  if (rows.length === 0) {
    return showEmptyState ? (
      <p className="empty-state">
        Nenhuma telemetria de sensor observada. Conecte um sensor WebSocket ou um publicador de HRV para preencher esta
        lista.
      </p>
    ) : null;
  }

  return (
    <div className="table-scroll">
      <table className="data-table sensor-list-table">
        <thead>
          <tr>
            <th scope="col">Sensor</th>
            <th scope="col">Sinal</th>
            <th scope="col">BPM</th>
            <th scope="col">RR (ms)</th>
            <th scope="col">Amostras IBI</th>
            <th scope="col">Amostras/min</th>
            <th scope="col">Última atualização</th>
            <th scope="col">Tópico</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
                <span className="subtle-line mono">{row.id}</span>
              </td>
              <td>
                <StatusPill tone={sensorSignalTone(row.signalState)} label={row.signalLabel} />
              </td>
              <td className="mono">{row.bpm}</td>
              <td className="mono">{row.rrMs}</td>
              <td className="mono">{row.ibiSampleCount}</td>
              <td className="mono">{row.samplesPerMinute}</td>
              <td className="mono">{row.lastUpdate}</td>
              <td className="mono">{row.topic}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
