import { Download } from "lucide-react";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type { SensorDataStreamSnapshot } from "../../domain/sensorTelemetry";
import { formatTime } from "../../lib/format";
import { SensorMetric } from "../sensors/SensorMetric";

const VISIBLE_ROW_LIMIT = 30;

interface SensorDataStreamPanelProps {
  snapshot: SensorDataStreamSnapshot;
  onExportJson: () => void;
}

/** Últimas amostras publicadas pelos sensores, com exportação da janela atual. */
export function SensorDataStreamPanel({ onExportJson, snapshot }: SensorDataStreamPanelProps) {
  const visibleRows = snapshot.rows.slice(0, VISIBLE_ROW_LIMIT);
  const hasRows = snapshot.rows.length > 0;

  return (
    <Panel
      className="sensor-data-panel overview-wide"
      title="Dados dos sensores ao vivo"
      action={
        <div className="panel-actions">
          <StatusPill
            tone={hasRows ? "ok" : "muted"}
            label={snapshot.totalSamples === 1 ? "1 amostra" : `${snapshot.totalSamples} amostras`}
          />
          <button
            className="mini-button strong"
            disabled={!hasRows}
            title={hasRows ? undefined : "Disponível quando houver amostras de sensor"}
            type="button"
            onClick={onExportJson}
          >
            <Download aria-hidden size={14} /> Salvar JSON
          </button>
        </div>
      }
    >
      <div className="sensor-data-summary">
        <SensorMetric label="Dispositivos" value={snapshot.clientCount} />
        <SensorMetric label="Tópicos" value={snapshot.topicCount} />
        <SensorMetric label="Exibindo" value={visibleRows.length} />
      </div>
      {visibleRows.length === 0 ? (
        <p className="empty-state">
          Aguardando publicações de sensores. Qualquer dispositivo WebSocket conectado que publique tópicos ou payloads
          de sensor aparece aqui.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table sensor-data-table">
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">Dispositivo</th>
                <th scope="col">Tópico</th>
                <th scope="col">Medição</th>
                <th scope="col">Payload</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={`${row.receivedAt}-${row.clientId}-${row.topic}-${index}`}>
                  <td className="mono">{formatTime(row.receivedAt)}</td>
                  <td>
                    <strong>{row.displayName ?? row.clientId}</strong>
                    <span className="subtle-line mono">{row.deviceType ?? row.clientId}</span>
                  </td>
                  <td className="mono">{row.topic}</td>
                  <td>
                    <span className="measurement-chip">{row.measurement}</span>
                    {typeof row.sequence === "number" && <span className="subtle-line mono">seq {row.sequence}</span>}
                  </td>
                  <td className="sensor-data-payload">{row.payloadPreview}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
