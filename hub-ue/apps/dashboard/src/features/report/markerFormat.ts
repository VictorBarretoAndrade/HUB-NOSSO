import type { BiometricChartMarkerGroup } from "../../domain/experienceAnalytics";
import { formatExperienceTime } from "../../domain/experienceRun";
import { sensorSignalLabel } from "../../domain/sensorTelemetry";
import { formatReportMs, formatReportNumber } from "../../lib/format";

type ChartMarker = BiometricChartMarkerGroup["markers"][number];

const EMPTY = "--";

/** Biometria capturada no instante do marker, em uma linha. */
export function markerBiometricSummary(marker: ChartMarker): string {
  const values = [
    typeof marker.bpm === "number" ? `BPM ${formatReportNumber(marker.bpm)}` : null,
    typeof marker.rrMs === "number" ? `RR ${formatReportMs(marker.rrMs)}` : null,
    marker.sensorSignal ? `sinal: ${sensorSignalLabel(marker.sensorSignal).toLowerCase()}` : null,
  ].filter((part): part is string => Boolean(part));
  return values.length > 0 ? values.join(" / ") : EMPTY;
}

/** Descrição textual completa de um grupo de markers (nome acessível do ponto no gráfico). */
export function markerGroupTooltip(group: BiometricChartMarkerGroup): string {
  return group.markers
    .map((marker) =>
      [
        `${marker.label} em ${formatExperienceTime(marker.experienceTimeMs)}`,
        marker.note,
        marker.source ? `origem ${marker.source}` : null,
        markerBiometricSummary(marker),
      ]
        .filter((part): part is string => Boolean(part) && part !== EMPTY)
        .join("; "),
    )
    .join("\n");
}

export function markerGroupTimeRange(group: BiometricChartMarkerGroup): string {
  const times = group.markers.map((marker) => marker.experienceTimeMs);
  const first = Math.min(...times);
  const last = Math.max(...times);
  return first === last ? formatExperienceTime(first) : `${formatExperienceTime(first)} – ${formatExperienceTime(last)}`;
}

export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}
