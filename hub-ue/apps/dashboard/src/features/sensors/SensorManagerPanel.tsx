import { RefreshCw } from "lucide-react";
import { StatusPill } from "../../components/StatusPill";
import type { SensorCommandAction } from "../../domain/api";
import type { ExperienceRunState } from "../../domain/experienceRun";
import {
  deriveSensorProviders,
  hasSensorManager,
  sensorProviderStateLabel,
  sensorProviderStateTone,
} from "../../domain/sensorManager";
import type { ManagedSensorView } from "../../domain/sensorManager";
import type { StatusResponse } from "../../domain/types";
import { ManagedSensorCard } from "./ManagedSensorCard";

interface SensorManagerPanelProps {
  isDispatching: boolean;
  run: ExperienceRunState;
  sensors: ManagedSensorView[];
  status: StatusResponse | null;
  onCommand: (action: SensorCommandAction, commandArguments?: Record<string, unknown>) => void;
}

/** Argumentos do comando de sensor: attach/detach precisam dizer a qual run se referem. */
function sensorCommandArguments(
  action: SensorCommandAction,
  sensor: ManagedSensorView,
  run: ExperienceRunState,
): Record<string, unknown> {
  const base = { sensorId: sensor.sensorId, reason: "dashboard" };
  if (action === "sensor.session.attach") {
    return { ...base, runId: run.runId };
  }
  if (action === "sensor.session.detach") {
    return { ...base, runId: sensor.attachedRunId ?? run.runId };
  }
  return base;
}

/** Sensores gerenciados pelo hub: descoberta, conexão e vínculo com a experiência. */
export function SensorManagerPanel({ isDispatching, onCommand, run, sensors, status }: SensorManagerPanelProps) {
  const managerOnline = hasSensorManager(status);
  const providers = deriveSensorProviders(status);
  const configuredCount = status?.sensorManager?.sensorCount ?? sensors.length;

  return (
    <div className="managed-sensors-panel">
      <div className="managed-sensors-toolbar">
        <div className="managed-sensors-toolbar-copy">
          <strong>Sensor Manager</strong>
          <span>
            {managerOnline
              ? `${configuredCount} ${configuredCount === 1 ? "sensor configurado" : "sensores configurados"}`
              : "aguardando o status do hub"}
          </span>
        </div>
        {providers.length > 0 && (
          <div className="sensor-provider-list" aria-label="Provedores de sensores">
            {providers.map((provider) => (
              <div className={`sensor-provider ${provider.state}`} key={provider.providerId}>
                <div className="sensor-provider-heading">
                  <strong>{provider.displayName}</strong>
                  <StatusPill
                    tone={sensorProviderStateTone(provider.state)}
                    label={sensorProviderStateLabel(provider.state)}
                  />
                </div>
                <span>
                  {provider.discoveredCount} encontrados / {provider.supportedCount} suportados /{" "}
                  {provider.unsupportedCount} ignorados
                </span>
                {provider.detail && <span className="sensor-provider-detail">{provider.detail}</span>}
              </div>
            ))}
          </div>
        )}
        <button
          className="mini-button strong"
          disabled={!managerOnline || isDispatching}
          title={managerOnline ? undefined : "O Sensor Manager não está disponível neste hub"}
          type="button"
          onClick={() => onCommand("sensor.scan", { reason: "dashboard" })}
        >
          <RefreshCw aria-hidden size={14} /> Buscar sensores
        </button>
      </div>

      {sensors.length === 0 ? (
        <p className="empty-state">
          {managerOnline
            ? "Nenhum sensor gerenciado encontrado ainda. Use “Buscar sensores” para procurar dispositivos."
            : "O Sensor Manager não foi reportado pelo hub. Inicie o hub com o Sensor Manager habilitado para gerenciar sensores por aqui."}
        </p>
      ) : (
        <div className="managed-sensor-list">
          {sensors.map((sensor) => (
            <ManagedSensorCard
              isDispatching={isDispatching}
              key={sensor.sensorId}
              run={run}
              sensor={sensor}
              onCommand={(action, target) => onCommand(action, sensorCommandArguments(action, target, run))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
