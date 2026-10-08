import type { BiometricChartMarkerGroup } from "../../domain/experienceAnalytics";
import { formatExperienceTime } from "../../domain/experienceRun";
import { markerBiometricSummary, markerGroupTimeRange } from "./markerFormat";

/** Lista textual dos markers do gráfico: a alternativa legível ao hover no SVG. */
export function MarkerCallouts({ groups }: { groups: BiometricChartMarkerGroup[] }) {
  const markerCount = groups.reduce((total, group) => total + group.markers.length, 0);

  return (
    <div className="marker-callouts">
      <div className="marker-callouts-header">
        <span>Detalhes dos markers</span>
        <span>
          {markerCount} {markerCount === 1 ? "marker" : "markers"} em {groups.length}{" "}
          {groups.length === 1 ? "grupo" : "grupos"}
        </span>
      </div>
      <div className="marker-callout-list">
        {groups.map((group, groupIndex) => (
          <div className="marker-callout-group" key={group.id}>
            <div className="marker-callout-group-title">
              <span>{group.isCluster ? group.displayLabel : `Marker ${groupIndex + 1}`}</span>
              <span>{markerGroupTimeRange(group)}</span>
            </div>
            {group.markers.map((marker) => (
              <div className="marker-callout-row" key={marker.markerId}>
                <span className="mono">{formatExperienceTime(marker.experienceTimeMs)}</span>
                <strong>{marker.label}</strong>
                <span className="mono">{marker.source ?? "origem --"}</span>
                <span>{markerBiometricSummary(marker)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
