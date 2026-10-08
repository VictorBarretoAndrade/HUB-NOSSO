import { buildUnrealTelemetryChartModel } from "../../domain/experienceAnalytics";
import type { UnrealTelemetryChartLane, UnrealTelemetryStateSegment } from "../../domain/experienceAnalytics";
import type { ExperienceReport } from "../../domain/experienceReport";
import { formatExperienceTime } from "../../domain/experienceRun";
import { formatBpmRange, formatCelsius, formatPercent, formatReportMs, formatReportNumber } from "../../lib/format";
import { CHART_VIEW_BOX, TIME_TICKS, tickX } from "./chartGeometry";
import { ReportMetric } from "./ReportMetric";

const GRID_TOP_Y = 20;
const GRID_BOTTOM_Y = 304;
const TIME_AXIS_LABEL_Y = 322;
const STATE_RAIL_Y = 278;
const STATE_RAIL_HEIGHT = 22;
const STATE_LABEL_MIN_WIDTH = 42;
const DOT_RADIUS = 2.7;
const AXIS_LABEL_OFFSET = 8;

const PLATFORM_LABEL: Record<string, string> = { windows: "Windows", android: "Android", mac: "macOS", linux: "Linux" };
const EXECUTION_MODE_LABEL: Record<string, string> = {
  editor: "Editor/PIE",
  pie: "Editor/PIE",
  "editor-pie": "Editor/PIE",
  packaged: "Empacotado",
};

function formatTelemetryRuntime(platform: string | undefined, executionMode: string | undefined): string {
  const platformLabel = PLATFORM_LABEL[platform?.toLowerCase() ?? ""] ?? platform;
  const executionModeLabel = EXECUTION_MODE_LABEL[executionMode?.toLowerCase() ?? ""] ?? executionMode;
  return [platformLabel, executionModeLabel].filter((value): value is string => Boolean(value)).join(" • ");
}

/** Sufixo que marca amostras do formato antigo de telemetria, de disponibilidade não verificada. */
function legacySuffix(quality: string): string {
  return quality === "legacy" ? " (legado)" : "";
}

interface UnrealTelemetryChartProps {
  analytics: ExperienceReport["analytics"];
  durationMs: number;
}

/** FPS, temperatura, RTT e perda reportados pelo Unreal em unreal.state durante a experiência. */
export function UnrealTelemetryChart({ analytics, durationMs }: UnrealTelemetryChartProps) {
  const model = buildUnrealTelemetryChartModel({ analytics, durationMs });
  const { stats } = model;
  const telemetry = analytics.unrealTelemetry;
  const latestSample = model.samples[model.samples.length - 1];

  if (model.samples.length === 0) {
    return (
      <p className="empty-state">
        Nenhuma telemetria de <span className="mono">unreal.state</span> capturada nesta experiência.
      </p>
    );
  }

  return (
    <div className="unreal-telemetry-chart-shell">
      <div className="unreal-telemetry-meta">
        {model.hasV2Samples && (
          <span className="telemetry-version verified">Telemetria V2: disponibilidade verificada</span>
        )}
        {model.hasLegacySamples && (
          <span className="telemetry-version legacy">Telemetria legada: disponibilidade desconhecida</span>
        )}
        {telemetry.sourceClientId && (
          <span className="telemetry-context-item">
            <em>{telemetry.observedSourceCount > 1 ? "Fonte mais recente" : "Fonte"}</em>
            <strong>{telemetry.sourceClientId}</strong>
          </span>
        )}
        {(model.context?.platform || model.context?.executionMode) && (
          <span className="telemetry-context-item">
            <em>Ambiente</em>
            <strong>{formatTelemetryRuntime(model.context?.platform, model.context?.executionMode)}</strong>
          </span>
        )}
      </div>

      <div className="unreal-telemetry-summary">
        <ReportMetric label="FPS mín/méd/máx" value={formatBpmRange(stats.fpsMin, stats.fpsAvg, stats.fpsMax)} />
        <ReportMetric label="Temperatura máx. da bateria" value={formatCelsius(stats.temperatureMaxC)} />
        <ReportMetric label="RTT médio do WebSocket" value={formatReportMs(stats.latencyAvgMs)} />
        <ReportMetric label="Perda máx. de sondas" value={formatPercent(stats.packetLossMaxPct)} />
        <ReportMetric label="Último estado" value={latestSample?.state ?? latestSample?.status ?? "--"} />
      </div>

      <div className="unreal-telemetry-legend">
        <span className="legend-item unreal-fps">FPS da aplicação</span>
        <span className="legend-item unreal-temp">Temperatura da bateria</span>
        <span className="legend-item unreal-latency">RTT do WebSocket</span>
        <span className="legend-item unreal-loss">Perda de sondas</span>
        <span className="legend-item unreal-state">Estado</span>
        {model.hasLegacySamples && <span className="legend-item unreal-legacy">Legado</span>}
      </div>

      <div className="chart-scroll">
        <svg
          aria-label="Gráfico da telemetria do Unreal ao longo da experiência"
          className="unreal-telemetry-chart"
          role="img"
          viewBox={CHART_VIEW_BOX}
        >
          {TIME_TICKS.map((tick) => (
            <g key={tick}>
              <line className="chart-grid-line" x1={tickX(tick)} x2={tickX(tick)} y1={GRID_TOP_Y} y2={GRID_BOTTOM_Y} />
              <text className="chart-axis-label" x={tickX(tick)} y={TIME_AXIS_LABEL_Y} textAnchor="middle">
                {formatExperienceTime(model.maxTimeMs * tick)}
              </text>
            </g>
          ))}
          {model.lanes.map((lane) => (
            <TelemetryLane lane={lane} key={lane.id} />
          ))}
          <g className="unreal-state-rail">
            <text className="chart-axis-label lane-title" x={tickX(0)} y={STATE_RAIL_Y - 7}>
              Estado
            </text>
            <rect className="chart-frame" x={tickX(0)} y={STATE_RAIL_Y} width={tickX(1) - tickX(0)} height={STATE_RAIL_HEIGHT} />
            {model.stateSegments.map((segment) => (
              <StateSegment segment={segment} key={segment.key} />
            ))}
          </g>
        </svg>
      </div>

      <div className="biometric-chart-stats">
        <span>{model.lanes.some((lane) => lane.isAggregated) ? "Agregado para facilitar a leitura" : "Telemetria bruta"}</span>
        <span>{model.statsAreVerified ? "Estatísticas V2 verificadas" : "Estatísticas legadas"}</span>
        <span>
          {stats.verifiedSampleCount} V2 / {stats.legacySampleCount} legadas
        </span>
        <span>{stats.stateChangeCount} mudanças de estado</span>
        <span>{model.samples.length} mensagens unreal.state</span>
      </div>
    </div>
  );
}

function TelemetryLane({ lane }: { lane: UnrealTelemetryChartLane }) {
  const { plot } = lane;
  const middleY = plot.y + plot.height / 2;

  return (
    <g className={`unreal-telemetry-lane ${lane.id}`}>
      <rect className="chart-frame" x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
      <line className="chart-grid-line horizontal" x1={plot.x} x2={plot.x + plot.width} y1={middleY} y2={middleY} />
      <text className="chart-axis-label lane-title" x={plot.x} y={plot.y - 8}>
        {lane.label}
      </text>
      <text className="chart-axis-label" x={plot.x - AXIS_LABEL_OFFSET} y={plot.y + 10} textAnchor="end">
        {formatReportNumber(lane.domain[1])}
      </text>
      <text className="chart-axis-label" x={plot.x - AXIS_LABEL_OFFSET} y={plot.y + plot.height} textAnchor="end">
        {formatReportNumber(lane.domain[0])}
      </text>
      {lane.availabilityStatus === "unavailable" && (
        <text
          className="telemetry-lane-availability unavailable"
          x={plot.x + plot.width - 8}
          y={plot.y + 14}
          textAnchor="end"
        >
          {`Indisponível: ${lane.availabilityReason ?? "não reportado"}`}
        </text>
      )}
      {lane.segments.map((segment) => (
        <path
          className={`unreal-telemetry-segment ${lane.id} ${segment.tone} ${segment.quality}`}
          d={segment.path}
          key={segment.key}
        />
      ))}
      {lane.points.map((point) => (
        <circle
          className={`unreal-telemetry-dot ${lane.id} ${point.phase} ${point.quality}`}
          cx={point.x}
          cy={point.y}
          key={point.key}
          r={DOT_RADIUS}
        >
          <title>
            {`${lane.label}${legacySuffix(point.quality)}: ${formatReportNumber(point.value)} ${lane.unit} em ${formatExperienceTime(point.experienceTimeMs)}`}
          </title>
        </circle>
      ))}
    </g>
  );
}

function StateSegment({ segment }: { segment: UnrealTelemetryStateSegment }) {
  return (
    <g className={`unreal-state-segment ${segment.tone} ${segment.quality}`}>
      <rect x={segment.x} y={STATE_RAIL_Y} width={segment.width} height={STATE_RAIL_HEIGHT} />
      {segment.width > STATE_LABEL_MIN_WIDTH && (
        <text x={segment.x + segment.width / 2} y={STATE_RAIL_Y + 15} textAnchor="middle">
          {segment.label}
        </text>
      )}
      <title>
        {`${segment.label}${legacySuffix(segment.quality)}: de ${formatExperienceTime(segment.startedAtMs)} a ${formatExperienceTime(segment.endedAtMs)}`}
      </title>
    </g>
  );
}
