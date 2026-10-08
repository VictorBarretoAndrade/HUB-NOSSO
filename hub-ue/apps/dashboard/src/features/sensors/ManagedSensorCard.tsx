import { StatusPill } from "../../components/StatusPill";
import type { SensorCommandAction } from "../../domain/api";
import type { ExperienceRunState } from "../../domain/experienceRun";
import { deriveLslSensorDetails, sensorActionAvailability, sensorStateLabel, sensorStateTone } from "../../domain/sensorManager";
import type { ManagedSensorView } from "../../domain/sensorManager";
import { formatSensorAge } from "../../domain/sensorTelemetry";
import { SensorMetric } from "./SensorMetric";

interface ManagedSensorCardProps {
  isDispatching: boolean;
  run: ExperienceRunState;
  sensor: ManagedSensorView;
  onCommand: (action: SensorCommandAction, sensor: ManagedSensorView) => void;
}

/**
 * Com uma experiência em andamento o sensor é vinculado direto à run; sem ela, é
 * "armado" para entrar na próxima. O par de botões troca de sentido conforme o caso.
 */
function sessionActions(sensor: ManagedSensorView, run: ExperienceRunState, isDispatching: boolean) {
  const availability = sensorActionAvailability(sensor, run, isDispatching);
  const runIsActive = (run.status === "running" || run.status === "paused") && Boolean(run.runId);
  const canJoin = runIsActive ? availability.attach : availability.arm;
  const joinHint = canJoin
    ? runIsActive
      ? "Vincular o sensor à experiência em andamento"
      : "Preparar o sensor para a próxima experiência"
    : availability.attachReason;
  const isJoining = runIsActive && sensor.armedForNextRun;
  const joinAction: SensorCommandAction = runIsActive ? "sensor.session.attach" : "sensor.session.arm";
  const leaveAction: SensorCommandAction = sensor.armedForNextRun ? "sensor.session.disarm" : "sensor.session.detach";

  return {
    availability,
    join: {
      action: joinAction,
      enabled: canJoin,
      hint: joinHint,
      label: runIsActive ? "Vincular" : "Armar",
    },
    leave: {
      action: leaveAction,
      enabled: sensor.armedForNextRun ? availability.disarm : availability.detach,
      label: isJoining ? "Vinculando…" : sensor.armedForNextRun ? "Desarmar" : "Desvincular",
    },
  };
}

export function ManagedSensorCard({ isDispatching, onCommand, run, sensor }: ManagedSensorCardProps) {
  const { availability, join, leave } = sessionActions(sensor, run, isDispatching);
  const lslDetails = deriveLslSensorDetails(sensor);
  const runLabel = sensor.armedForNextRun ? "Próxima run" : (sensor.attachedRunId ?? "--");

  return (
    <article className={`managed-sensor-card ${sensor.state} ${sensor.armedForNextRun ? "armed" : ""}`.trim()}>
      <div className="managed-sensor-header">
        <div>
          <strong>{lslDetails?.name ?? sensor.displayName}</strong>
          <span className="mono">{sensor.sensorId}</span>
        </div>
        <div className="run-header-chip-row">
          <StatusPill tone={sensorStateTone(sensor.state)} label={sensorStateLabel(sensor.state)} />
          {sensor.armedForNextRun && <StatusPill tone="ok" label="Armado" />}
        </div>
      </div>

      {lslDetails ? (
        <>
          <div className="managed-sensor-meta lsl">
            <SensorMetric label="Tipo" value={lslDetails.type} />
            <SensorMetric label="Canais" value={lslDetails.channels} />
            <SensorMetric label="Taxa" value={lslDetails.rate} />
            <SensorMetric label="Origem" value={lslDetails.origin} />
            <SensorMetric label="Sincronia" value={lslDetails.sync} />
            <SensorMetric label="Preview" value={formatSensorAge(sensor.previewAgeMs)} />
            <SensorMetric label="Run" value={runLabel} />
          </div>
          {(lslDetails.format || lslDetails.channelSummary) && (
            <div className="managed-sensor-lsl-details">
              {lslDetails.format && <span className="mono">{lslDetails.format}</span>}
              {lslDetails.channelSummary && <span>{lslDetails.channelSummary}</span>}
            </div>
          )}
        </>
      ) : (
        <div className="managed-sensor-meta">
          <SensorMetric label="Origem" value={sensor.source} />
          <SensorMetric label="Adaptador" value={sensor.adapterId} />
          <SensorMetric label="Dispositivo" value={sensor.deviceType} />
          <SensorMetric label="Preview" value={formatSensorAge(sensor.previewAgeMs)} />
          <SensorMetric label="Qualidade" value={sensor.quality ?? "--"} />
          <SensorMetric label="Run" value={runLabel} />
        </div>
      )}

      <div className="managed-sensor-preview">
        <span>Preview</span>
        <strong>{sensor.previewSummary}</strong>
      </div>
      {sensor.lastError && (
        <p className="sensor-error" role="status">
          {sensor.lastError}
        </p>
      )}

      <div className="managed-sensor-actions">
        <button
          className="mini-button"
          disabled={!availability.connect}
          type="button"
          onClick={() => onCommand("sensor.connect", sensor)}
        >
          Conectar
        </button>
        <button
          className="mini-button"
          disabled={!availability.disconnect}
          type="button"
          onClick={() => onCommand("sensor.disconnect", sensor)}
        >
          Desconectar
        </button>
        <button
          className="mini-button strong"
          disabled={!join.enabled}
          title={join.hint}
          type="button"
          onClick={() => onCommand(join.action, sensor)}
        >
          {join.label}
        </button>
        <button
          className="mini-button danger"
          disabled={!leave.enabled}
          type="button"
          onClick={() => onCommand(leave.action, sensor)}
        >
          {leave.label}
        </button>
      </div>
      {!join.enabled && join.hint && <p className="inline-hint">{join.hint}</p>}

      <div className="managed-sensor-topics">
        {sensor.topics.length === 0 ? (
          <span className="mono">sem tópicos brutos</span>
        ) : (
          sensor.topics.map((topic) => (
            <span className="mono" key={topic}>
              {topic}
            </span>
          ))
        )}
      </div>
    </article>
  );
}
