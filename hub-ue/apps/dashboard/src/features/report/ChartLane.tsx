import type { BiometricChartLane } from "../../domain/experienceAnalytics";
import { formatExperienceTime } from "../../domain/experienceRun";
import { formatReportNumber } from "../../lib/format";

const DOT_RADIUS = 3.4;
const AXIS_LABEL_OFFSET = 8;

/** Uma faixa (BPM ou RR) do gráfico de biometria: moldura, eixo, série e pontos notáveis. */
export function ChartLane({ lane }: { lane: BiometricChartLane }) {
  const { plot } = lane;
  const middleY = plot.y + plot.height / 2;
  // Em séries densas só os pontos que pedem atenção (sinal ruim, pausa) ganham marcador.
  const visiblePoints = lane.points.filter(
    (point) => lane.showDots || point.signal === "poor" || point.phase === "paused",
  );

  return (
    <g className={`chart-lane ${lane.id}`}>
      <rect className="chart-frame" x={plot.x} y={plot.y} width={plot.width} height={plot.height} />
      <line className="chart-grid-line horizontal" x1={plot.x} x2={plot.x + plot.width} y1={middleY} y2={middleY} />
      <text className="chart-axis-label lane-title" x={lane.labelPosition.x} y={lane.labelPosition.y}>
        {lane.label}
      </text>
      <text className="chart-axis-label" x={plot.x - AXIS_LABEL_OFFSET} y={plot.y + 10} textAnchor="end">
        {formatReportNumber(lane.domain[1])}
      </text>
      <text className="chart-axis-label" x={plot.x - AXIS_LABEL_OFFSET} y={plot.y + plot.height} textAnchor="end">
        {formatReportNumber(lane.domain[0])}
      </text>
      {lane.segments.map((segment) => (
        <path className={`chart-step-segment ${lane.id} ${segment.tone}`} d={segment.path} key={segment.key} />
      ))}
      {visiblePoints.map((point) => (
        <circle
          className={`chart-dot ${lane.id} signal-${point.signal} phase-${point.phase}`}
          cx={point.x}
          cy={point.y}
          key={point.key}
          r={DOT_RADIUS}
        >
          <title>{`${lane.label}: ${formatReportNumber(point.value)} ${lane.unit} em ${formatExperienceTime(point.experienceTimeMs)}`}</title>
        </circle>
      ))}
    </g>
  );
}
