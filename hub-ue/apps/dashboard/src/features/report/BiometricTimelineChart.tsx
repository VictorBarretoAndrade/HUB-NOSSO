import { buildBiometricChartModel, markerGroupExpansionLayout } from "../../domain/experienceAnalytics";
import type { SensorAnalyticsSeries } from "../../domain/experienceAnalytics";
import type { ExperienceReport } from "../../domain/experienceReport";
import { formatExperienceTime } from "../../domain/experienceRun";
import { formatBpmRange, formatReportMs, formatTime } from "../../lib/format";
import { CHART_VIEW_BOX, TIME_TICKS, tickX } from "./chartGeometry";
import { ChartLane } from "./ChartLane";
import { MarkerCallouts } from "./MarkerCallouts";
import { MarkerGroupPopover } from "./MarkerGroupPopover";
import { expansionItemAsGroup, MarkerRail } from "./MarkerRail";
import { useMarkerFocus } from "./useMarkerFocus";

const GRID_TOP_Y = 24;
const GRID_BOTTOM_Y = 226;
const TIME_AXIS_LABEL_Y = 316;

interface BiometricTimelineChartProps {
  analytics: ExperienceReport["analytics"];
  durationMs: number;
  selectedSensorId: string;
  sensors: SensorAnalyticsSeries[];
  onSelectSensor: (sensorId: string) => void;
}

/** BPM e RR ao longo da experiência, com pausas e markers posicionados no tempo. */
export function BiometricTimelineChart({
  analytics,
  durationMs,
  onSelectSensor,
  selectedSensorId,
  sensors,
}: BiometricTimelineChartProps) {
  const chart = buildBiometricChartModel({ analytics, durationMs, sensorId: selectedSensorId });
  const focus = useMarkerFocus();
  const sensor = chart.selectedSensor;
  const hasSamples = Boolean(sensor && sensor.samples.length > 0);

  const activeGroup = chart.markerGroups.find((group) => group.id === focus.activeGroupId) ?? null;
  const activeExpansion = activeGroup ? markerGroupExpansionLayout(activeGroup) : null;
  const activeExpansionItem = activeExpansion?.items.find((item) => item.markerId === focus.activeMarkerId) ?? null;
  // Um cluster só mostra o balão quando um dos seus markers está em foco.
  const popoverGroup =
    activeGroup && activeExpansionItem
      ? expansionItemAsGroup(activeGroup, activeExpansionItem)
      : activeGroup && !activeGroup.isCluster
        ? activeGroup
        : null;
  const primaryLane = chart.lanes[0];

  return (
    <div className="biometric-chart-shell">
      <div className="biometric-chart-toolbar">
        <div className="chart-legend">
          <span className="legend-item bpm">BPM</span>
          <span className="legend-item rr">RR (ms)</span>
          <span className="legend-item marker">Markers</span>
          <span className="legend-item pause">Pausa</span>
        </div>
        <span className="chart-note">Tendência agregada; as exportações mantêm as amostras brutas.</span>
        {sensors.length > 1 && (
          <label>
            Sensor
            <select value={selectedSensorId} onChange={(event) => onSelectSensor(event.target.value)}>
              {sensors.map((option) => (
                <option key={option.sensorClientId} value={option.sensorClientId}>
                  {option.sensorClientId}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!sensor || !hasSamples ? (
        <p className="empty-state">Nenhuma amostra biométrica capturada nesta experiência.</p>
      ) : (
        <>
          <div className="chart-scroll">
            <svg
              aria-label="Gráfico de BPM e RR ao longo da experiência, com markers e pausas"
              className="biometric-chart"
              role="img"
              viewBox={CHART_VIEW_BOX}
              onClick={focus.clearPin}
            >
              {chart.lanes.map((lane) => (
                <ChartLane lane={lane} key={lane.id} />
              ))}
              {TIME_TICKS.map((tick) => (
                <g key={tick}>
                  <line className="chart-grid-line" x1={tickX(tick)} x2={tickX(tick)} y1={GRID_TOP_Y} y2={GRID_BOTTOM_Y} />
                  <text className="chart-axis-label" x={tickX(tick)} y={TIME_AXIS_LABEL_Y} textAnchor="middle">
                    {formatExperienceTime(chart.maxTimeMs * tick)}
                  </text>
                </g>
              ))}
              {chart.pauseMarkers.map((pause) => (
                <g className="chart-pause-marker" key={`${pause.realStartedAt}-${pause.realEndedAt ?? "open"}`}>
                  <line x1={pause.x} x2={pause.x} y1={GRID_TOP_Y} y2={GRID_BOTTOM_Y} />
                  <text x={pause.x + 5} y={GRID_TOP_Y - 2}>
                    pausa
                  </text>
                  <title>
                    {`Pausa em ${formatExperienceTime(pause.startExperienceTimeMs)} (${formatTime(pause.realStartedAt)} – ${
                      pause.realEndedAt ? formatTime(pause.realEndedAt) : "em aberto"
                    })`}
                  </title>
                </g>
              ))}
              <MarkerRail activeExpansion={activeExpansion} focus={focus} groups={chart.markerGroups} />
              {popoverGroup && <MarkerGroupPopover group={popoverGroup} />}
            </svg>
          </div>
          {chart.markerGroups.length > 0 && <MarkerCallouts groups={chart.markerGroups} />}
          <div className="biometric-chart-stats">
            <span className="mono">{sensor.sensorClientId}</span>
            <span>
              {primaryLane.isAggregated
                ? `${primaryLane.points.length} de ${primaryLane.rawPointCount} amostras exibidas`
                : `${primaryLane.rawPointCount} amostras`}
            </span>
            <span>BPM {formatBpmRange(sensor.stats.bpmMin, sensor.stats.bpmAvg, sensor.stats.bpmMax)}</span>
            <span>RR médio {formatReportMs(sensor.stats.rrAvgMs)}</span>
            <span>{sensor.stats.poorSignalCount} com sinal ruim</span>
            <span>{sensor.stats.gapCount} falhas</span>
          </div>
        </>
      )}
    </div>
  );
}
