import { useMemo, useState } from "react";
import { EmptyRow } from "../../components/EmptyRow";
import { Metric } from "../../components/Metric";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import { sensorSignalLabel, sensorSignalTone } from "../../domain/sensorTelemetry";
import type { SensorTelemetrySummary } from "../../domain/sensorTelemetry";
import type { HubClient } from "../../domain/types";
import { SensorClientDetail } from "../sensors/SensorClientDetail";
import { sensorSummaryForClient } from "../sensors/sensorHelpers";

const ALL_ROLES = "all";
// Papéis são valores do protocolo do hub e por isso aparecem como no fio.
const ROLE_FILTERS = [ALL_ROLES, "unreal", "sensor", "logger", "dashboard", "controller", "ai", "system"];
/** Acima disso a fila de saída indica um cliente lento ou travado. */
const OUTBOX_WARNING_SIZE = 20;

interface ClientsViewProps {
  clients: HubClient[];
  sensorSummaries: SensorTelemetrySummary[];
  totalCount: number;
}

export function ClientsView({ clients, sensorSummaries, totalCount }: ClientsViewProps) {
  const [roleFilter, setRoleFilter] = useState(ALL_ROLES);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const visibleClients = useMemo(
    () => clients.filter((client) => roleFilter === ALL_ROLES || client.role === roleFilter),
    [clients, roleFilter],
  );
  const selectedClient =
    visibleClients.find((client) => client.clientId === selectedClientId) ?? visibleClients[0] ?? null;

  return (
    <section className="clients-layout">
      <div className="client-main">
        <div className="table-toolbar">
          <strong>Clientes conectados</strong>
          <span className="counter">
            {visibleClients.length} de {totalCount}
          </span>
          <div className="role-tabs" role="group" aria-label="Filtrar clientes por papel">
            {ROLE_FILTERS.map((role) => (
              <button
                aria-pressed={roleFilter === role}
                className={roleFilter === role ? "active" : ""}
                key={role}
                onClick={() => setRoleFilter(role)}
                type="button"
              >
                {role === ALL_ROLES ? "todos" : role}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Fila</th>
                <th scope="col">Client ID</th>
                <th scope="col">Papel</th>
                <th scope="col">Capacidades</th>
                <th scope="col">Sinal</th>
                <th scope="col">Assinaturas</th>
                <th scope="col">Outbox</th>
              </tr>
            </thead>
            <tbody>
              {visibleClients.map((client) => {
                const sensorSummary = sensorSummaryForClient(sensorSummaries, client.clientId);
                const isSelected = selectedClient?.clientId === client.clientId;
                const outboxIsHigh = client.outboxSize > OUTBOX_WARNING_SIZE;
                return (
                  <tr
                    className={isSelected ? "selected" : ""}
                    key={client.clientId}
                    onClick={() => setSelectedClientId(client.clientId)}
                  >
                    <td>
                      <span className={`status-dot ${outboxIsHigh ? "warn" : "ok"}`} aria-hidden />
                      <span className="visually-hidden">{outboxIsHigh ? "Fila de saída alta" : "Fila normal"}</span>
                    </td>
                    <td className="mono">
                      <button aria-pressed={isSelected} className="row-select" type="button">
                        {client.clientId}
                      </button>
                    </td>
                    <td>
                      <StatusPill tone="muted" label={client.role} />
                    </td>
                    <td>{client.capabilities.join(", ") || "--"}</td>
                    <td>
                      {client.role === "sensor" ? (
                        <StatusPill
                          tone={sensorSignalTone(sensorSummary?.signalState ?? "unknown")}
                          label={sensorSignalLabel(sensorSummary?.signalState ?? "unknown")}
                        />
                      ) : (
                        "--"
                      )}
                    </td>
                    <td>{client.subscriptions.length}</td>
                    <td className={outboxIsHigh ? "danger-text" : ""}>{client.outboxSize}</td>
                  </tr>
                );
              })}
              {visibleClients.length === 0 && (
                <EmptyRow
                  columns={7}
                  text={
                    clients.length === 0
                      ? "Nenhum cliente conectado ao hub. Inicie o Unreal, um sensor ou um simulador."
                      : `Nenhum cliente com o papel "${roleFilter}". Escolha outro filtro.`
                  }
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Panel className="client-detail" title={selectedClient ? `Detalhes · ${selectedClient.role}` : "Detalhes do cliente"}>
        {selectedClient ? (
          <>
            <p className="mono large">{selectedClient.clientId}</p>
            <Metric label="Capacidades" value={selectedClient.capabilities.length} />
            <Metric label="Assinaturas" value={selectedClient.subscriptions.length} />
            <Metric label="Outbox" value={selectedClient.outboxSize} />
            {selectedClient.role === "sensor" && (
              <SensorClientDetail
                client={selectedClient}
                summary={sensorSummaryForClient(sensorSummaries, selectedClient.clientId)}
              />
            )}
            <p className="field-label">Tópicos assinados</p>
            <pre className="payload-box">{JSON.stringify(selectedClient.subscriptions, null, 2)}</pre>
          </>
        ) : (
          <p className="muted-copy">Selecione um cliente na tabela para ver suas assinaturas.</p>
        )}
      </Panel>
    </section>
  );
}
