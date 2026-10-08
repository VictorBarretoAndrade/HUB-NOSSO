import { markerGroupPopoverLayout } from "../../domain/experienceAnalytics";
import type { BiometricChartMarkerGroup } from "../../domain/experienceAnalytics";
import { formatExperienceTime } from "../../domain/experienceRun";
import { markerBiometricSummary, truncateText } from "./markerFormat";

const VISIBLE_MARKER_LIMIT = 4;
const ROW_HEIGHT = 36;
const PADDING_X = 10;
const FIRST_ROW_Y = 34;
const LABEL_MAX_CHARS = 48;
const SUMMARY_MAX_CHARS = 58;

/** Balão (em SVG) com os detalhes do marker em foco no gráfico de biometria. */
export function MarkerGroupPopover({ group }: { group: BiometricChartMarkerGroup }) {
  const layout = markerGroupPopoverLayout(group);
  const visibleMarkers = group.markers.slice(0, VISIBLE_MARKER_LIMIT);
  const overflowCount = group.markers.length - visibleMarkers.length;
  const textX = layout.x + PADDING_X;

  return (
    <g className="chart-marker-popover" pointerEvents="none">
      <line x1={layout.anchorX} x2={layout.anchorX} y1={layout.anchorY} y2={layout.y + layout.height} />
      <rect x={layout.x} y={layout.y} width={layout.width} height={layout.height} rx="3" />
      <text className="chart-marker-popover-title" x={textX} y={layout.y + 16}>
        {group.isCluster ? group.displayLabel : "Marker"}
      </text>
      {visibleMarkers.map((marker, index) => (
        <g
          className="chart-marker-popover-item"
          key={marker.markerId}
          transform={`translate(${textX} ${layout.y + FIRST_ROW_Y + index * ROW_HEIGHT})`}
        >
          <text className="chart-marker-popover-meta" x="0" y="0">
            {formatExperienceTime(marker.experienceTimeMs)}
          </text>
          <text className="chart-marker-popover-label" x="0" y="14">
            {truncateText(marker.label, LABEL_MAX_CHARS)}
          </text>
          <text className="chart-marker-popover-summary" x="0" y="28">
            {truncateText(markerBiometricSummary(marker), SUMMARY_MAX_CHARS)}
          </text>
        </g>
      ))}
      {overflowCount > 0 && (
        <text
          className="chart-marker-popover-overflow"
          x={textX}
          y={layout.y + FIRST_ROW_Y + visibleMarkers.length * ROW_HEIGHT}
        >
          +{overflowCount} markers na lista abaixo
        </text>
      )}
    </g>
  );
}
