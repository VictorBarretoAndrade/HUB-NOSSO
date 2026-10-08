import { formatExperienceTime } from "./experienceRun";
import type { ExperiencePhase, ExperienceRunState } from "./experienceRun";
import type { SensorSignalState } from "./sensorTelemetry";
import type { StreamEvent } from "./types";

export interface ExperienceAnalytics {
  sensors: SensorAnalyticsSeries[];
  unrealTelemetry: UnrealTelemetrySeries;
  markers: AnalyticsMarkerPoint[];
  pauseRanges: AnalyticsPauseRange[];
}

export interface UnrealTelemetrySeries {
  sourceClientId?: string;
  observedSourceCount: number;
  samples: UnrealTelemetrySample[];
  stats: {
    sampleCount: number;
    verifiedSampleCount: number;
    legacySampleCount: number;
    fpsSampleCount: number;
    temperatureSampleCount: number;
    latencySampleCount: number;
    packetLossSampleCount: number;
    fpsMin?: number;
    fpsAvg?: number;
    fpsMax?: number;
    temperatureMaxC?: number;
    latencyAvgMs?: number;
    packetLossMaxPct?: number;
    stateChangeCount: number;
  };
}

export interface UnrealTelemetryContext {
  source?: string;
  origin?: string;
  platform?: string;
  executionMode?: string;
}

export interface UnrealTelemetryAvailabilityEntry {
  status: string;
  source?: string;
  reason?: string;
}

export type UnrealTelemetryAvailability = Record<string, UnrealTelemetryAvailabilityEntry>;
export type UnrealTelemetryMetricId = "fps" | "temperatureC" | "latencyMs" | "packetLossPct";
export type UnrealTelemetryDataQuality = "verified" | "legacy";

export interface UnrealTelemetrySample {
  sourceClientId: string;
  experienceTimeMs: number;
  receivedAt: string;
  schemaVersion?: number;
  context?: UnrealTelemetryContext;
  availability?: UnrealTelemetryAvailability;
  fps?: number;
  batteryTemperatureC?: number;
  /** @deprecated Use batteryTemperatureC in analytical exports. */
  temperatureC?: number;
  latencyMs?: number;
  packetLossPct?: number;
  state?: string;
  status?: string;
  phase: ExperiencePhase;
}

export interface SensorAnalyticsSeries {
  sensorClientId: string;
  device?: string;
  samples: BiometricChartSample[];
  stats: {
    bpmMin?: number;
    bpmAvg?: number;
    bpmMax?: number;
    rrAvgMs?: number;
    sampleCount: number;
    poorSignalCount: number;
    gapCount: number;
  };
}

export interface BiometricChartSample {
  experienceTimeMs: number;
  receivedAt: string;
  bpm?: number;
  rrMs?: number;
  hrStatus?: number;
  signal: SensorSignalState;
  sequence?: number;
  phase: ExperiencePhase;
}

export interface AnalyticsMarkerPoint {
  markerId: string;
  commandId?: string;
  label: string;
  note?: string;
  source?: string;
  sourceClientId: string;
  receivedAt: string;
  experienceTimeMs: number;
  bpm?: number;
  rrMs?: number;
  sensorSignal?: SensorSignalState;
}

export interface AnalyticsPauseRange {
  realStartedAt: string;
  realEndedAt?: string;
  startExperienceTimeMs: number;
  endExperienceTimeMs: number;
}

export interface BiometricChartModel {
  selectedSensor?: SensorAnalyticsSeries;
  maxTimeMs: number;
  lanes: BiometricChartLane[];
  markerGroups: BiometricChartMarkerGroup[];
  markerTargets: BiometricChartMarkerTarget[];
  pauseMarkers: BiometricChartPauseMarker[];
}

export interface BiometricChartLane {
  id: "bpm" | "rrMs";
  label: string;
  unit: string;
  domain: [number, number];
  labelPosition: {
    x: number;
    y: number;
  };
  plot: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  points: BiometricChartPoint[];
  segments: BiometricChartSegment[];
  rawPointCount: number;
  isAggregated: boolean;
  showDots: boolean;
}

export interface BiometricChartPoint {
  key: string;
  x: number;
  y: number;
  value: number;
  experienceTimeMs: number;
  receivedAt: string;
  signal: SensorSignalState;
  phase: ExperiencePhase;
}

export interface BiometricChartSegment {
  key: string;
  path: string;
  tone: "normal" | "paused";
}

export interface BiometricChartMarker {
  markerId: string;
  label: string;
  shortLabel: string;
  x: number;
  experienceTimeMs: number;
  note?: string;
  source?: string;
  bpm?: number;
  rrMs?: number;
  sensorSignal?: SensorSignalState;
}

export interface BiometricChartMarkerGroup {
  id: string;
  x: number;
  labelX: number;
  labelY: number;
  labelWidth: number;
  displayLabel: string;
  markers: BiometricChartMarker[];
  isCluster: boolean;
}

export interface BiometricChartMarkerTarget {
  id: string;
  groupId: string;
  x: number;
  y: number;
  marker: BiometricChartMarker;
  isClustered: boolean;
}

export interface BiometricChartMarkerPopoverLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

export interface MarkerGroupExpansionLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  items: MarkerGroupExpansionItem[];
}

export interface MarkerGroupExpansionItem {
  markerId: string;
  label: string;
  fullLabel: string;
  x: number;
  y: number;
  width: number;
  marker: BiometricChartMarker;
}

export interface BiometricChartPauseMarker {
  x: number;
  label: "Paused";
  realStartedAt: string;
  realEndedAt?: string;
  startExperienceTimeMs: number;
  endExperienceTimeMs: number;
}

export interface UnrealTelemetryChartModel {
  maxTimeMs: number;
  lanes: UnrealTelemetryChartLane[];
  stateSegments: UnrealTelemetryStateSegment[];
  samples: UnrealTelemetrySample[];
  stats: UnrealTelemetrySeries["stats"];
  context?: UnrealTelemetryContext;
  hasV2Samples: boolean;
  hasLegacySamples: boolean;
  statsAreVerified: boolean;
}

export interface UnrealTelemetryChartLane {
  id: UnrealTelemetryMetricId;
  label: string;
  unit: string;
  domain: [number, number];
  plot: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  points: UnrealTelemetryChartPoint[];
  segments: UnrealTelemetryChartSegment[];
  rawPointCount: number;
  isAggregated: boolean;
  availabilityStatus: "available" | "unavailable" | "legacy" | "unknown";
  availabilityReason?: string;
  verifiedPointCount: number;
  legacyPointCount: number;
}

export interface UnrealTelemetryChartPoint {
  key: string;
  x: number;
  y: number;
  value: number;
  experienceTimeMs: number;
  receivedAt: string;
  phase: ExperiencePhase;
  quality: UnrealTelemetryDataQuality;
  sourceStartIndex: number;
  sourceEndIndex: number;
}

export interface UnrealTelemetryChartSegment {
  key: string;
  path: string;
  tone: "normal" | "paused";
  quality: UnrealTelemetryDataQuality;
}

export interface UnrealTelemetryStateSegment {
  key: string;
  x: number;
  width: number;
  label: string;
  tone: "ok" | "warn" | "error" | "muted";
  quality: UnrealTelemetryDataQuality;
  startedAtMs: number;
  endedAtMs: number;
}

interface PauseInterval {
  startMs: number;
  endMs?: number;
}

interface HrvAnalyticsSample extends BiometricChartSample {
  sensorClientId: string;
  device?: string;
  ibiSampleCount: number;
}

const HRV_RAW_TOPIC = "hrv.raw";
const MARKER_TOPIC = "experience.marker";
const UNREAL_STATE_TOPIC = "unreal.state";
const SENSOR_STREAM_GAP_MS = 10000;
const MARKER_SNAPSHOT_MAX_AGE_MS = 5000;

const BIOMETRICS_TIMELINE_COLUMNS = [
  "sensorClientId",
  "experienceTimeMs",
  "experienceTime",
  "receivedAt",
  "bpm",
  "rrMs",
  "hrStatus",
  "signal",
  "sequence",
  "phase",
] as const;

export const CHART_PLOT_X = 54;
export const CHART_PLOT_WIDTH = 644;
const CHART_LANE_HEIGHT = 72;
const CHART_LANE_LABEL_X = 14;
const BPM_LANE_Y = 30;
const RR_LANE_Y = 132;
const MAX_CHART_POINTS = 120;
const MARKER_LABEL_MIN_WIDTH = 42;
const MARKER_LABEL_MAX_WIDTH = 92;
const MARKER_LABEL_GAP = 6;
const MARKER_CLUSTER_GAP = 12;
const MARKER_LABEL_ROWS = [252, 272, 292] as const;
const MARKER_TARGET_Y = 224;
const MARKER_TARGET_MIN_GAP = 10;
const MARKER_POPOVER_WIDTH = 340;
const MARKER_POPOVER_PADDING = 10;
const MARKER_POPOVER_HEADER_HEIGHT = 21;
const MARKER_POPOVER_MARKER_BLOCK_HEIGHT = 38;
const MARKER_POPOVER_OVERFLOW_ROW_HEIGHT = 16;
const MARKER_POPOVER_MAX_ROWS = 4;
const MARKER_POPOVER_GAP = 10;
const MARKER_EXPANSION_Y = 226;
const MARKER_EXPANSION_HEIGHT = 22;
const MARKER_EXPANSION_PADDING_X = 8;
const MARKER_EXPANSION_ITEM_GAP = 6;
const MARKER_EXPANSION_ITEM_MAX_WIDTH = 86;
const UNREAL_CHART_LANE_HEIGHT = 42;
const UNREAL_CHART_LANE_Y = [28, 88, 148, 208] as const;
const MAX_UNREAL_CHART_POINTS = 140;

export function deriveExperienceAnalytics(run: ExperienceRunState, events: StreamEvent[]): ExperienceAnalytics {
  if (!run.startedAt) {
    return { sensors: [], unrealTelemetry: emptyUnrealTelemetrySeries(), markers: [], pauseRanges: [] };
  }

  const windowEvents = events
    .filter((event) => isWithinRunWindow(event.receivedAt, run))
    .sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
  const unrealSourceClientId = latestUnrealSourceClientId(windowEvents);
  const pauseIntervals = derivePauseIntervals(windowEvents, unrealSourceClientId);
  const hrvSamples = windowEvents
    .filter((event) => event.envelope.topic === HRV_RAW_TOPIC)
    .map((event) => hrvSampleFromEvent(event, run.startedAt!, pauseIntervals));

  return {
    sensors: deriveSensorSeries(hrvSamples),
    unrealTelemetry: deriveUnrealTelemetrySeries(windowEvents, run.startedAt, pauseIntervals, unrealSourceClientId),
    markers: deriveMarkerPoints(windowEvents, hrvSamples, run.startedAt, pauseIntervals),
    pauseRanges: pauseIntervals.map((interval) => pauseRangeFromInterval(interval, run.startedAt!)),
  };
}

export function serializeBiometricsTimelineCsv(analytics: ExperienceAnalytics): string {
  const rows = analytics.sensors.flatMap((sensor) =>
    sensor.samples.map((sample) =>
      BIOMETRICS_TIMELINE_COLUMNS.map((column) => {
        const row = {
          sensorClientId: sensor.sensorClientId,
          experienceTimeMs: sample.experienceTimeMs,
          experienceTime: formatExperienceTime(sample.experienceTimeMs),
          receivedAt: sample.receivedAt,
          bpm: sample.bpm,
          rrMs: sample.rrMs,
          hrStatus: sample.hrStatus,
          signal: sample.signal,
          sequence: sample.sequence,
          phase: sample.phase,
        };
        return csvCell(row[column]);
      }).join(","),
    ),
  );
  return [BIOMETRICS_TIMELINE_COLUMNS.join(","), ...rows].join("\n");
}

export function buildBiometricChartModel({
  analytics,
  durationMs,
  sensorId,
}: {
  analytics: ExperienceAnalytics;
  durationMs: number;
  sensorId?: string;
}): BiometricChartModel {
  const selectedSensor =
    analytics.sensors.find((sensor) => sensor.sensorClientId === sensorId) ?? analytics.sensors[0];
  const samples = selectedSensor?.samples ?? [];
  const maxTimeMs = Math.max(
    durationMs,
    ...samples.map((sample) => sample.experienceTimeMs),
    ...analytics.markers.map((marker) => marker.experienceTimeMs),
    1000,
  );
  const bpmDomain = chartDomain(samples.map((sample) => sample.bpm), [40, 180]);
  const rrDomain = chartDomain(samples.map((sample) => sample.rrMs), [300, 1200]);
  const bpmRawPoints = rawChartLanePoints(samples, "bpm", maxTimeMs, bpmDomain, BPM_LANE_Y);
  const rrRawPoints = rawChartLanePoints(samples, "rrMs", maxTimeMs, rrDomain, RR_LANE_Y);
  const bpmPoints = readableChartLanePoints(bpmRawPoints, maxTimeMs, bpmDomain, BPM_LANE_Y);
  const rrPoints = readableChartLanePoints(rrRawPoints, maxTimeMs, rrDomain, RR_LANE_Y);
  const markerGroups = layoutMarkerGroups(analytics.markers, maxTimeMs);

  return {
    selectedSensor,
    maxTimeMs,
    lanes: [
      {
        id: "bpm",
        label: "BPM",
        unit: "bpm",
        domain: bpmDomain,
        labelPosition: chartLaneLabelPosition(BPM_LANE_Y),
        plot: { x: CHART_PLOT_X, y: BPM_LANE_Y, width: CHART_PLOT_WIDTH, height: CHART_LANE_HEIGHT },
        points: bpmPoints,
        segments: chartLaneSegments(bpmPoints),
        rawPointCount: bpmRawPoints.length,
        isAggregated: bpmPoints.length < bpmRawPoints.length,
        showDots: bpmRawPoints.length <= MAX_CHART_POINTS,
      },
      {
        id: "rrMs",
        label: "RR (ms)",
        unit: "ms",
        domain: rrDomain,
        labelPosition: chartLaneLabelPosition(RR_LANE_Y),
        plot: { x: CHART_PLOT_X, y: RR_LANE_Y, width: CHART_PLOT_WIDTH, height: CHART_LANE_HEIGHT },
        points: rrPoints,
        segments: chartLaneSegments(rrPoints),
        rawPointCount: rrRawPoints.length,
        isAggregated: rrPoints.length < rrRawPoints.length,
        showDots: rrRawPoints.length <= MAX_CHART_POINTS,
      },
    ],
    markerGroups,
    markerTargets: layoutMarkerTargets(markerGroups),
    pauseMarkers: analytics.pauseRanges.map((range) => ({
      x: chartX(range.startExperienceTimeMs, maxTimeMs),
      label: "Paused",
      realStartedAt: range.realStartedAt,
      realEndedAt: range.realEndedAt,
      startExperienceTimeMs: range.startExperienceTimeMs,
      endExperienceTimeMs: range.endExperienceTimeMs,
    })),
  };
}

export function buildUnrealTelemetryChartModel({
  analytics,
  durationMs,
}: {
  analytics: ExperienceAnalytics;
  durationMs: number;
}): UnrealTelemetryChartModel {
  const samples = analytics.unrealTelemetry.samples;
  const hasV2Samples = samples.some(isV2TelemetrySample);
  const hasLegacySamples = samples.some((sample) => !isV2TelemetrySample(sample));
  const maxTimeMs = Math.max(
    durationMs,
    ...samples.map((sample) => sample.experienceTimeMs),
    ...analytics.markers.map((marker) => marker.experienceTimeMs),
    1000,
  );
  const definitions: Array<{
    id: UnrealTelemetryChartLane["id"];
    label: string;
    unit: string;
    fallback: [number, number];
    y: number;
  }> = [
    { id: "fps", label: "FPS da aplicação", unit: "fps", fallback: [0, 90], y: UNREAL_CHART_LANE_Y[0] },
    { id: "temperatureC", label: "Temperatura da bateria", unit: "°C", fallback: [20, 60], y: UNREAL_CHART_LANE_Y[1] },
    { id: "latencyMs", label: "WebSocket RTT", unit: "ms", fallback: [0, 120], y: UNREAL_CHART_LANE_Y[2] },
    { id: "packetLossPct", label: "Perda de sondas", unit: "%", fallback: [0, 5], y: UNREAL_CHART_LANE_Y[3] },
  ];

  const lanes = definitions.map((definition) => {
    const domain = chartDomain(samples.map((sample) => sample[definition.id]), definition.fallback);
    const rawPoints = rawUnrealTelemetryPoints(samples, definition.id, maxTimeMs, domain, definition.y);
    const points = readableUnrealTelemetryPoints(rawPoints, maxTimeMs, domain, definition.y);
    const availability = telemetryLaneAvailability(samples, definition.id);
    return {
      id: definition.id,
      label: definition.label,
      unit: definition.unit,
      domain,
      plot: { x: CHART_PLOT_X, y: definition.y, width: CHART_PLOT_WIDTH, height: UNREAL_CHART_LANE_HEIGHT },
      points,
      segments: unrealTelemetrySegments(points),
      rawPointCount: rawPoints.length,
      isAggregated: points.length < rawPoints.length,
      availabilityStatus: availability.status,
      availabilityReason: availability.reason,
      verifiedPointCount: rawPoints.filter((point) => point.quality === "verified").length,
      legacyPointCount: rawPoints.filter((point) => point.quality === "legacy").length,
    } satisfies UnrealTelemetryChartLane;
  });

  return {
    maxTimeMs,
    lanes,
    stateSegments: unrealStateSegments(samples, maxTimeMs),
    samples,
    stats: analytics.unrealTelemetry.stats,
    context: latestTelemetryContext(samples),
    hasV2Samples,
    hasLegacySamples,
    statsAreVerified: hasV2Samples,
  };
}

function layoutMarkerTargets(groups: BiometricChartMarkerGroup[]): BiometricChartMarkerTarget[] {
  return groups.flatMap((group) => {
    const placedTargets: BiometricChartMarkerTarget[] = [];
    for (const marker of group.markers) {
      const previousTarget = placedTargets[placedTargets.length - 1];
      const minX = previousTarget ? previousTarget.x + MARKER_TARGET_MIN_GAP : CHART_PLOT_X;
      const x = clamp(marker.x, minX, CHART_PLOT_X + CHART_PLOT_WIDTH);
      placedTargets.push({
        id: `${group.id}:${marker.markerId}`,
        groupId: group.id,
        x,
        y: MARKER_TARGET_Y,
        marker,
        isClustered: group.isCluster,
      });
    }
    return placedTargets;
  });
}

export function markerGroupPopoverLayout(group: BiometricChartMarkerGroup): BiometricChartMarkerPopoverLayout {
  const visibleRowCount = Math.min(MARKER_POPOVER_MAX_ROWS, group.markers.length);
  const overflowRowCount = group.markers.length > MARKER_POPOVER_MAX_ROWS ? 1 : 0;
  const height =
    MARKER_POPOVER_PADDING * 2 +
    MARKER_POPOVER_HEADER_HEIGHT +
    visibleRowCount * MARKER_POPOVER_MARKER_BLOCK_HEIGHT +
    overflowRowCount * MARKER_POPOVER_OVERFLOW_ROW_HEIGHT;
  const x = clamp(group.x - MARKER_POPOVER_WIDTH / 2, CHART_PLOT_X, CHART_PLOT_X + CHART_PLOT_WIDTH - MARKER_POPOVER_WIDTH);
  const y = Math.max(12, roundOneDecimal(group.labelY - MARKER_POPOVER_GAP - height));
  return {
    x,
    y,
    width: MARKER_POPOVER_WIDTH,
    height,
    anchorX: group.x,
    anchorY: group.labelY,
  };
}

export function markerGroupExpansionLayout(group: BiometricChartMarkerGroup): MarkerGroupExpansionLayout | null {
  if (!group.isCluster || group.markers.length <= 1) {
    return null;
  }

  const items = group.markers.map((marker) => {
    const label = shortExpansionLabel(marker.shortLabel);
    const width = Math.min(MARKER_EXPANSION_ITEM_MAX_WIDTH, Math.max(MARKER_LABEL_MIN_WIDTH, label.length * 6.1 + 16));
    return {
      markerId: marker.markerId,
      label,
      fullLabel: marker.label,
      x: 0,
      y: MARKER_EXPANSION_Y,
      width,
      marker,
    } satisfies MarkerGroupExpansionItem;
  });

  const innerWidth = items.reduce((total, item) => total + item.width, 0) + Math.max(0, items.length - 1) * MARKER_EXPANSION_ITEM_GAP;
  const width = innerWidth + MARKER_EXPANSION_PADDING_X * 2;
  const x = clamp(group.x - width / 2, CHART_PLOT_X, CHART_PLOT_X + CHART_PLOT_WIDTH - width);
  let cursorX = x + MARKER_EXPANSION_PADDING_X;

  return {
    x,
    y: MARKER_EXPANSION_Y,
    width,
    height: MARKER_EXPANSION_HEIGHT,
    items: items.map((item) => {
      const laidOut = { ...item, x: cursorX };
      cursorX += item.width + MARKER_EXPANSION_ITEM_GAP;
      return laidOut;
    }),
  };
}

function layoutMarkerGroups(markers: AnalyticsMarkerPoint[], maxTimeMs: number): BiometricChartMarkerGroup[] {
  const chartMarkers = markers
    .map((marker) => chartMarkerFromAnalyticsMarker(marker, maxTimeMs))
    .sort((left, right) => left.x - right.x);
  const markerGroups = clusterChartMarkers(chartMarkers).map(chartMarkerGroupFromMarkers);
  const rowRightEdges = MARKER_LABEL_ROWS.map(() => CHART_PLOT_X - MARKER_LABEL_GAP);
  return markerGroups.map((group) => {
    const preferredX = clamp(group.x - group.labelWidth / 2, CHART_PLOT_X, CHART_PLOT_X + CHART_PLOT_WIDTH - group.labelWidth);
    let rowIndex = rowRightEdges.findIndex((rightEdge) => preferredX >= rightEdge + MARKER_LABEL_GAP);
    if (rowIndex < 0) {
      rowIndex = rowRightEdges.indexOf(Math.min(...rowRightEdges));
    }
    const labelX = clamp(preferredX, CHART_PLOT_X, CHART_PLOT_X + CHART_PLOT_WIDTH - group.labelWidth);
    rowRightEdges[rowIndex] = labelX + group.labelWidth;
    return {
      ...group,
      labelX,
      labelY: MARKER_LABEL_ROWS[rowIndex],
    };
  });
}

function chartMarkerFromAnalyticsMarker(marker: AnalyticsMarkerPoint, maxTimeMs: number): BiometricChartMarker {
  return {
    markerId: marker.markerId,
    label: marker.label,
    shortLabel: shortMarkerLabel(marker.label),
    x: chartX(marker.experienceTimeMs, maxTimeMs),
    experienceTimeMs: marker.experienceTimeMs,
    note: marker.note,
    source: marker.source,
    bpm: marker.bpm,
    rrMs: marker.rrMs,
    sensorSignal: marker.sensorSignal,
  };
}

function clusterChartMarkers(markers: BiometricChartMarker[]): BiometricChartMarker[][] {
  const groups: BiometricChartMarker[][] = [];
  let currentGroup: BiometricChartMarker[] = [];
  let currentRightEdge = Number.NEGATIVE_INFINITY;

  for (const marker of markers) {
    const labelWidth = markerLabelWidth(marker.shortLabel);
    const labelX = clamp(marker.x - labelWidth / 2, CHART_PLOT_X, CHART_PLOT_X + CHART_PLOT_WIDTH - labelWidth);
    const labelRightEdge = labelX + labelWidth;
    if (currentGroup.length === 0 || labelX < currentRightEdge + MARKER_CLUSTER_GAP) {
      currentGroup.push(marker);
      currentRightEdge = Math.max(currentRightEdge, labelRightEdge);
      continue;
    }
    groups.push(currentGroup);
    currentGroup = [marker];
    currentRightEdge = labelRightEdge;
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}

function chartMarkerGroupFromMarkers(markers: BiometricChartMarker[]): BiometricChartMarkerGroup {
  const isCluster = markers.length > 1;
  const displayLabel = isCluster ? `${markers.length} markers` : markers[0].shortLabel;
  const labelWidth = markerLabelWidth(displayLabel);
  return {
    id: markers.map((marker) => marker.markerId).join("|"),
    x: roundOneDecimal(markers.reduce((total, marker) => total + marker.x, 0) / markers.length),
    labelX: CHART_PLOT_X,
    labelY: MARKER_LABEL_ROWS[0],
    labelWidth,
    displayLabel,
    markers,
    isCluster,
  };
}

function shortMarkerLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed.length > 12 ? `${trimmed.slice(0, 11)}...` : trimmed;
}

function markerLabelWidth(label: string): number {
  return Math.min(MARKER_LABEL_MAX_WIDTH, Math.max(MARKER_LABEL_MIN_WIDTH, label.length * 6.4 + 18));
}

function shortExpansionLabel(label: string): string {
  return label.length > 13 ? `${label.slice(0, 10)}...` : label;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, roundOneDecimal(value)));
}

function deriveSensorSeries(samples: HrvAnalyticsSample[]): SensorAnalyticsSeries[] {
  const bySensor = new Map<string, HrvAnalyticsSample[]>();
  for (const sample of samples) {
    bySensor.set(sample.sensorClientId, [...(bySensor.get(sample.sensorClientId) ?? []), sample]);
  }

  return Array.from(bySensor.entries())
    .map(([sensorClientId, sensorSamples]) => {
      const sorted = [...sensorSamples].sort((left, right) => left.experienceTimeMs - right.experienceTimeMs);
      const bpmValues = sorted.map((sample) => sample.bpm).filter(isPositiveNumber);
      const rrValues = sorted.map((sample) => sample.rrMs).filter(isNumber);
      return {
        sensorClientId,
        device: sorted.find((sample) => sample.device)?.device,
        samples: sorted.map(({ sensorClientId: _sensorClientId, device: _device, ibiSampleCount: _ibiSampleCount, ...sample }) => sample),
        stats: {
          bpmMin: minValue(bpmValues),
          bpmAvg: averageValue(bpmValues),
          bpmMax: maxValue(bpmValues),
          rrAvgMs: averageValue(rrValues),
          sampleCount: sorted.length,
          poorSignalCount: sorted.filter((sample) => sample.signal === "poor").length,
          gapCount: gapCount(sorted),
        },
      } satisfies SensorAnalyticsSeries;
    })
    .sort((left, right) => left.sensorClientId.localeCompare(right.sensorClientId));
}

function emptyUnrealTelemetrySeries(): UnrealTelemetrySeries {
  return {
    observedSourceCount: 0,
    samples: [],
    stats: {
      sampleCount: 0,
      verifiedSampleCount: 0,
      legacySampleCount: 0,
      fpsSampleCount: 0,
      temperatureSampleCount: 0,
      latencySampleCount: 0,
      packetLossSampleCount: 0,
      stateChangeCount: 0,
    },
  };
}

function deriveUnrealTelemetrySeries(
  events: StreamEvent[],
  startedAt: string,
  pauseIntervals: PauseInterval[],
  selectedSourceClientId?: string,
): UnrealTelemetrySeries {
  const unrealEvents = events.filter((event) => event.envelope.topic === UNREAL_STATE_TOPIC);
  const sourceClientIds = new Set(unrealEvents.map((event) => event.envelope.clientId));
  const sourceClientId = selectedSourceClientId ?? latestUnrealSourceClientId(unrealEvents);
  const selectedEvents = sourceClientId
    ? unrealEvents.filter((event) => event.envelope.clientId === sourceClientId)
    : [];
  const samples = selectedEvents
    .map((event) => unrealTelemetrySampleFromEvent(event, startedAt, pauseIntervals))
    .sort((left, right) => left.experienceTimeMs - right.experienceTimeMs);
  const hasV2Samples = samples.some(isV2TelemetrySample);
  const statisticSamples = hasV2Samples ? samples.filter(isV2TelemetrySample) : samples;
  const fpsValues = statisticSamples
    .map((sample) => sample.fps)
    .filter(hasV2Samples ? isNumber : isPositiveNumber);
  const temperatureValues = statisticSamples.map((sample) => sample.temperatureC).filter(isNumber);
  const latencyValues = statisticSamples.map((sample) => sample.latencyMs).filter(isNumber);
  const packetLossValues = statisticSamples.map((sample) => sample.packetLossPct).filter(isNumber);

  return {
    sourceClientId,
    observedSourceCount: sourceClientIds.size,
    samples,
    stats: {
      sampleCount: samples.length,
      verifiedSampleCount: samples.filter(isV2TelemetrySample).length,
      legacySampleCount: samples.filter((sample) => !isV2TelemetrySample(sample)).length,
      fpsSampleCount: fpsValues.length,
      temperatureSampleCount: temperatureValues.length,
      latencySampleCount: latencyValues.length,
      packetLossSampleCount: packetLossValues.length,
      fpsMin: minValue(fpsValues),
      fpsAvg: averageValue(fpsValues),
      fpsMax: maxValue(fpsValues),
      temperatureMaxC: maxValue(temperatureValues),
      latencyAvgMs: averageValue(latencyValues),
      packetLossMaxPct: maxValue(packetLossValues),
      stateChangeCount: stateChangeCount(samples),
    },
  };
}

function unrealTelemetrySampleFromEvent(
  event: StreamEvent,
  startedAt: string,
  pauseIntervals: PauseInterval[],
): UnrealTelemetrySample {
  const payload = event.envelope.payload ?? {};
  const telemetry = readRecord(payload.telemetry);
  const schemaVersion = readNumber(telemetry.schemaVersion);
  const isV2 = schemaVersion === 2;
  const availability = isV2 ? readTelemetryAvailability(telemetry.availability) : undefined;
  const state = readString(payload.state) ?? readString(telemetry.state);
  const status = readString(payload.status) ?? readString(telemetry.status);
  const sample: UnrealTelemetrySample = {
    sourceClientId: event.envelope.clientId,
    experienceTimeMs: experienceTimeAt(event.receivedAt, startedAt, pauseIntervals),
    receivedAt: event.receivedAt,
    state,
    status,
    phase: phaseAt(event.receivedAt, pauseIntervals),
  };

  if (typeof schemaVersion === "number") {
    sample.schemaVersion = schemaVersion;
  }
  if (isV2) {
    sample.context = readTelemetryContext(telemetry.context);
    sample.availability = availability ?? {};
  }

  for (const metric of ["fps", "temperatureC", "latencyMs", "packetLossPct"] as const) {
    const value = readTelemetryMetric(payload, telemetry, metric, isV2, availability);
    if (typeof value === "number") {
      sample[metric] = value;
    }
  }
  if (typeof sample.temperatureC === "number") {
    sample.batteryTemperatureC = sample.temperatureC;
  }

  return sample;
}

function readTelemetryMetric(
  payload: Record<string, unknown>,
  telemetry: Record<string, unknown>,
  metric: UnrealTelemetryMetricId,
  isV2: boolean,
  availability: UnrealTelemetryAvailability | undefined,
): number | undefined {
  const value = readTelemetryMetricValue(payload, telemetry, metric, isV2);
  if (!isV2) {
    return value;
  }
  return telemetryAvailabilityForMetric(availability, metric)?.status === "available" ? value : undefined;
}

function readTelemetryMetricValue(
  payload: Record<string, unknown>,
  telemetry: Record<string, unknown>,
  metric: UnrealTelemetryMetricId,
  isV2: boolean,
): number | undefined {
  if (metric === "temperatureC") {
    if (isV2) {
      return (
        readNumber(telemetry.batteryTemperatureC) ??
        readNumber(telemetry.temperatureC) ??
        readNumber(payload.batteryTemperatureC) ??
        readNumber(payload.temperatureC)
      );
    }
    return (
      readNumber(payload.temperatureC) ??
      readNumber(payload.batteryTemperatureC) ??
      readNumber(telemetry.temperatureC) ??
      readNumber(telemetry.batteryTemperatureC)
    );
  }
  return isV2
    ? readNumber(telemetry[metric]) ?? readNumber(payload[metric])
    : readNumber(payload[metric]) ?? readNumber(telemetry[metric]);
}

function readTelemetryContext(value: unknown): UnrealTelemetryContext {
  const record = readRecord(value);
  const context: UnrealTelemetryContext = {};
  const source = readString(record.source);
  const origin = readString(record.origin);
  const platform = readString(record.platform);
  const executionMode = readString(record.executionMode);
  if (source) context.source = source;
  if (origin) context.origin = origin;
  if (platform) context.platform = platform;
  if (executionMode) context.executionMode = executionMode;
  return context;
}

function readTelemetryAvailability(value: unknown): UnrealTelemetryAvailability {
  const availability: UnrealTelemetryAvailability = {};
  for (const [metric, rawEntry] of Object.entries(readRecord(value))) {
    const entry = readRecord(rawEntry);
    const status = readString(entry.status)?.toLowerCase();
    if (!status) {
      continue;
    }
    const normalized: UnrealTelemetryAvailabilityEntry = { status };
    const source = readString(entry.source);
    const reason = readString(entry.reason);
    if (source) normalized.source = source;
    if (reason) normalized.reason = reason;
    availability[metric] = normalized;
  }
  return availability;
}

function telemetryAvailabilityForMetric(
  availability: UnrealTelemetryAvailability | undefined,
  metric: UnrealTelemetryMetricId,
): UnrealTelemetryAvailabilityEntry | undefined {
  if (!availability) {
    return undefined;
  }
  if (metric === "temperatureC") {
    return availability.batteryTemperatureC ?? availability.temperatureC;
  }
  return availability[metric];
}

function telemetryLaneAvailability(
  samples: UnrealTelemetrySample[],
  metric: UnrealTelemetryMetricId,
): { status: UnrealTelemetryChartLane["availabilityStatus"]; reason?: string } {
  const latestV2 = [...samples].reverse().find(isV2TelemetrySample);
  if (!latestV2) {
    return { status: samples.length > 0 ? "legacy" : "unknown" };
  }

  const entry = telemetryAvailabilityForMetric(latestV2.availability, metric);
  if (entry?.status === "available" && typeof latestV2[metric] === "number") {
    return { status: "available" };
  }
  if (entry?.status === "available") {
    return { status: "unavailable", reason: "invalid-sample" };
  }
  return { status: "unavailable", reason: entry?.reason ?? "not-reported" };
}

function latestTelemetryContext(samples: UnrealTelemetrySample[]): UnrealTelemetryContext | undefined {
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index];
    if (
      isV2TelemetrySample(sample) &&
      sample.context &&
      Object.values(sample.context).some((value) => Boolean(value))
    ) {
      return { ...sample.context };
    }
  }
  return undefined;
}

function isV2TelemetrySample(sample: UnrealTelemetrySample): boolean {
  return sample.schemaVersion === 2;
}

function stateChangeCount(samples: UnrealTelemetrySample[]): number {
  let count = 0;
  let previous = "";
  for (const sample of samples) {
    const label = unrealStateLabel(sample);
    if (label && label !== previous) {
      count += 1;
      previous = label;
    }
  }
  return count;
}

function rawUnrealTelemetryPoints(
  samples: UnrealTelemetrySample[],
  key: UnrealTelemetryChartLane["id"],
  maxTimeMs: number,
  domain: [number, number],
  laneY: number,
): UnrealTelemetryChartPoint[] {
  return samples
    .map((sample, sampleIndex) => {
      const value = sample[key];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
      }
      return {
        key: `${sample.receivedAt}-${key}`,
        x: chartX(sample.experienceTimeMs, maxTimeMs),
        y: chartY(value, domain, laneY, UNREAL_CHART_LANE_HEIGHT),
        value,
        experienceTimeMs: sample.experienceTimeMs,
        receivedAt: sample.receivedAt,
        phase: sample.phase,
        quality: isV2TelemetrySample(sample) ? "verified" : "legacy",
        sourceStartIndex: sampleIndex,
        sourceEndIndex: sampleIndex,
      } satisfies UnrealTelemetryChartPoint;
    })
    .filter((point): point is UnrealTelemetryChartPoint => point !== null);
}

function readableUnrealTelemetryPoints(
  rawPoints: UnrealTelemetryChartPoint[],
  maxTimeMs: number,
  domain: [number, number],
  laneY: number,
): UnrealTelemetryChartPoint[] {
  if (rawPoints.length <= MAX_UNREAL_CHART_POINTS) {
    return rawPoints;
  }
  const bucketSizeMs = Math.max(1, maxTimeMs / MAX_UNREAL_CHART_POINTS);
  const buckets = new Map<string, { bucket: number; points: UnrealTelemetryChartPoint[] }>();
  for (const point of rawPoints) {
    const bucket = Math.min(MAX_UNREAL_CHART_POINTS - 1, Math.floor(point.experienceTimeMs / bucketSizeMs));
    const key = `${bucket}-${point.quality}`;
    const current = buckets.get(key);
    buckets.set(key, { bucket, points: [...(current?.points ?? []), point] });
  }
  return Array.from(buckets.values())
    .sort((left, right) => left.bucket - right.bucket || left.points[0].sourceStartIndex - right.points[0].sourceStartIndex)
    .map(({ bucket, points }) => {
      const value = roundOneDecimal(points.reduce((total, point) => total + point.value, 0) / points.length);
      const experienceTimeMs = Math.round(points.reduce((total, point) => total + point.experienceTimeMs, 0) / points.length);
      const latest = points[points.length - 1];
      return {
        key: `unreal-bucket-${bucket}-${latest.key}`,
        x: chartX(experienceTimeMs, maxTimeMs),
        y: chartY(value, domain, laneY, UNREAL_CHART_LANE_HEIGHT),
        value,
        experienceTimeMs,
        receivedAt: latest.receivedAt,
        phase: points.some((point) => point.phase === "paused") ? "paused" : "running",
        quality: latest.quality,
        sourceStartIndex: points[0].sourceStartIndex,
        sourceEndIndex: latest.sourceEndIndex,
      } satisfies UnrealTelemetryChartPoint;
    });
}

function unrealTelemetrySegments(points: UnrealTelemetryChartPoint[]): UnrealTelemetryChartSegment[] {
  const segments: UnrealTelemetryChartSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      Date.parse(current.receivedAt) - Date.parse(previous.receivedAt) > SENSOR_STREAM_GAP_MS ||
      current.sourceStartIndex > previous.sourceEndIndex + 1 ||
      current.quality !== previous.quality
    ) {
      continue;
    }
    segments.push({
      key: `${previous.key}-${current.key}`,
      path: `M ${previous.x} ${previous.y} L ${current.x} ${current.y}`,
      tone: previous.phase === "paused" || current.phase === "paused" ? "paused" : "normal",
      quality: current.quality,
    });
  }
  return segments;
}

function unrealStateSegments(samples: UnrealTelemetrySample[], maxTimeMs: number): UnrealTelemetryStateSegment[] {
  const spans: Array<{
    startedAtMs: number;
    endedAtMs: number;
    label: string;
    quality: UnrealTelemetryDataQuality;
  }> = [];
  for (const [index, sample] of samples.entries()) {
    const label = unrealStateLabel(sample) || "unknown";
    const quality = isV2TelemetrySample(sample) ? "verified" : "legacy";
    const next = samples[index + 1];
    const endedAtMs = next?.experienceTimeMs ?? maxTimeMs;
    const previous = spans[spans.length - 1];
    if (previous && previous.label === label && previous.quality === quality) {
      previous.endedAtMs = endedAtMs;
      continue;
    }
    spans.push({ startedAtMs: sample.experienceTimeMs, endedAtMs, label, quality });
  }

  return spans.map((span) => {
    const x = chartX(span.startedAtMs, maxTimeMs);
    const endX = chartX(span.endedAtMs, maxTimeMs);
    return {
      key: `${span.startedAtMs}-${span.endedAtMs}-${span.label}`,
      x,
      width: Math.max(2, roundOneDecimal(endX - x)),
      label: span.label,
      tone: unrealStateTone(span.label),
      quality: span.quality,
      startedAtMs: span.startedAtMs,
      endedAtMs: span.endedAtMs,
    };
  });
}

function unrealStateLabel(sample: UnrealTelemetrySample): string {
  return (sample.state || sample.status || "unknown").toLowerCase();
}

function unrealStateTone(label: string): UnrealTelemetryStateSegment["tone"] {
  if (label === "error" || label === "failed") return "error";
  if (label === "paused" || label === "idle") return "warn";
  if (label === "running" || label === "online" || label === "busy") return "ok";
  return "muted";
}

function rawChartLanePoints(
  samples: BiometricChartSample[],
  key: "bpm" | "rrMs",
  maxTimeMs: number,
  domain: [number, number],
  laneY: number,
): BiometricChartPoint[] {
  return samples
    .map((sample) => {
      const value = sample[key];
      if (typeof value !== "number" || value <= 0) {
        return null;
      }
      return {
        key: `${sample.receivedAt}-${key}`,
        x: chartX(sample.experienceTimeMs, maxTimeMs),
        y: chartY(value, domain, laneY, CHART_LANE_HEIGHT),
        value,
        experienceTimeMs: sample.experienceTimeMs,
        receivedAt: sample.receivedAt,
        signal: sample.signal,
        phase: sample.phase,
      } satisfies BiometricChartPoint;
    })
    .filter((point): point is BiometricChartPoint => point !== null);
}

function readableChartLanePoints(
  rawPoints: BiometricChartPoint[],
  maxTimeMs: number,
  domain: [number, number],
  laneY: number,
): BiometricChartPoint[] {
  if (rawPoints.length <= MAX_CHART_POINTS) {
    return rawPoints;
  }

  const bucketSizeMs = Math.max(1, maxTimeMs / MAX_CHART_POINTS);
  const buckets = new Map<number, BiometricChartPoint[]>();
  for (const point of rawPoints) {
    const bucket = Math.min(MAX_CHART_POINTS - 1, Math.floor(point.experienceTimeMs / bucketSizeMs));
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), point]);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([bucket, points]) => {
      const value = roundOneDecimal(points.reduce((total, point) => total + point.value, 0) / points.length);
      const experienceTimeMs = Math.round(points.reduce((total, point) => total + point.experienceTimeMs, 0) / points.length);
      const latest = points[points.length - 1];
      return {
        key: `bucket-${bucket}-${latest.key}`,
        x: chartX(experienceTimeMs, maxTimeMs),
        y: chartY(value, domain, laneY, CHART_LANE_HEIGHT),
        value,
        experienceTimeMs,
        receivedAt: latest.receivedAt,
        signal: points.some((point) => point.signal === "poor") ? "poor" : latest.signal,
        phase: points.some((point) => point.phase === "paused") ? "paused" : "running",
      } satisfies BiometricChartPoint;
    });
}

function chartLaneSegments(points: BiometricChartPoint[]): BiometricChartSegment[] {
  const segments: BiometricChartSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (Date.parse(current.receivedAt) - Date.parse(previous.receivedAt) > SENSOR_STREAM_GAP_MS) {
      continue;
    }
    segments.push({
      key: `${previous.key}-${current.key}`,
      path: `M ${previous.x} ${previous.y} L ${current.x} ${current.y}`,
      tone: previous.phase === "paused" || current.phase === "paused" ? "paused" : "normal",
    });
  }
  return segments;
}

function chartLaneLabelPosition(laneY: number): { x: number; y: number } {
  return {
    x: CHART_LANE_LABEL_X,
    y: roundOneDecimal(laneY + CHART_LANE_HEIGHT / 2 + 4),
  };
}

function chartDomain(values: Array<number | undefined>, fallback: [number, number]): [number, number] {
  const numeric = values.filter(isPositiveNumber);
  if (numeric.length === 0) {
    return fallback;
  }
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  if (min === max) {
    return [Math.max(0, min - 10), max + 10];
  }
  const padding = Math.max(5, (max - min) * 0.12);
  return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
}

function chartX(experienceTimeMs: number, maxTimeMs: number): number {
  return roundOneDecimal(CHART_PLOT_X + (Math.max(0, experienceTimeMs) / Math.max(1, maxTimeMs)) * CHART_PLOT_WIDTH);
}

function chartY(value: number, domain: [number, number], laneY: number, laneHeight: number): number {
  const [min, max] = domain;
  const ratio = (value - min) / Math.max(1, max - min);
  return roundOneDecimal(laneY + laneHeight - Math.max(0, Math.min(1, ratio)) * laneHeight);
}

function deriveMarkerPoints(
  events: StreamEvent[],
  samples: HrvAnalyticsSample[],
  startedAt: string,
  pauseIntervals: PauseInterval[],
): AnalyticsMarkerPoint[] {
  const markers = events
    .filter((event) => event.envelope.topic === MARKER_TOPIC)
    .map<AnalyticsMarkerPoint | null>((event) => {
      const payload = event.envelope.payload ?? {};
      const label = readString(payload.label);
      if (!label) {
        return null;
      }
      const snapshot = latestSampleBefore(event.receivedAt, samples);
      const point: AnalyticsMarkerPoint = {
        markerId: readString(payload.markerId) ?? event.envelope.id ?? `${event.receivedAt}-${event.envelope.clientId}`,
        label,
        sourceClientId: event.envelope.clientId,
        receivedAt: event.receivedAt,
        experienceTimeMs: experienceTimeAt(event.receivedAt, startedAt, pauseIntervals),
      };
      const commandId = readString(payload.commandId);
      const note = readString(payload.note);
      const source = readString(payload.source);
      if (commandId) point.commandId = commandId;
      if (note) point.note = note;
      if (source) point.source = source;
      if (typeof snapshot?.bpm === "number") point.bpm = snapshot.bpm;
      if (typeof snapshot?.rrMs === "number") point.rrMs = snapshot.rrMs;
      if (snapshot?.signal) point.sensorSignal = snapshot.signal;
      return point;
    })
    .filter((marker): marker is AnalyticsMarkerPoint => marker !== null)
    .sort((left, right) => left.experienceTimeMs - right.experienceTimeMs);

  const seen = new Set<string>();
  return markers.filter((marker) => {
    const key = marker.commandId || marker.markerId;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function hrvSampleFromEvent(event: StreamEvent, startedAt: string, pauseIntervals: PauseInterval[]): HrvAnalyticsSample {
  const payload = event.envelope.payload ?? {};
  const bpm = readNumber(payload.bpm);
  const rrMs = readNumber(payload.rrMs);
  const hrStatus = readNumber(payload.hrStatus);
  const ibiMs = Array.isArray(payload.ibiMs) ? payload.ibiMs : [];
  const ibiSampleCount = readNumber(payload.ibiSampleCount) ?? ibiMs.length;
  return {
    sensorClientId: readString(payload.sensorId) ?? event.envelope.clientId,
    device: readString(payload.device),
    experienceTimeMs: experienceTimeAt(event.receivedAt, startedAt, pauseIntervals),
    receivedAt: event.receivedAt,
    bpm: typeof bpm === "number" ? Math.round(bpm) : undefined,
    rrMs: typeof rrMs === "number" ? roundOneDecimal(rrMs) : undefined,
    hrStatus,
    signal: signalStateFromSample(bpm, hrStatus),
    sequence: readNumber(payload.sequence),
    phase: phaseAt(event.receivedAt, pauseIntervals),
    ibiSampleCount,
  };
}

function latestUnrealSourceClientId(events: StreamEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.envelope.topic === UNREAL_STATE_TOPIC) {
      return event.envelope.clientId;
    }
  }
  return undefined;
}

function derivePauseIntervals(events: StreamEvent[], sourceClientId?: string): PauseInterval[] {
  const intervals: PauseInterval[] = [];
  let pausedStartMs: number | null = null;

  for (const event of events) {
    if (event.envelope.topic !== UNREAL_STATE_TOPIC) {
      continue;
    }
    if (sourceClientId && event.envelope.clientId !== sourceClientId) {
      continue;
    }
    const phase = phaseFromPayload(event.envelope.payload ?? {});
    if (phase === "paused" && pausedStartMs === null) {
      pausedStartMs = Date.parse(event.receivedAt);
    }
    if (phase === "running" && pausedStartMs !== null) {
      intervals.push({ startMs: pausedStartMs, endMs: Date.parse(event.receivedAt) });
      pausedStartMs = null;
    }
  }

  if (pausedStartMs !== null) {
    intervals.push({ startMs: pausedStartMs });
  }
  return intervals;
}

function pauseRangeFromInterval(interval: PauseInterval, startedAt: string): AnalyticsPauseRange {
  const realStartedAt = new Date(interval.startMs).toISOString();
  const realEndedAt = typeof interval.endMs === "number" ? new Date(interval.endMs).toISOString() : undefined;
  return {
    realStartedAt,
    realEndedAt,
    startExperienceTimeMs: experienceTimeAt(realStartedAt, startedAt, [interval]),
    endExperienceTimeMs: experienceTimeAt(realEndedAt ?? realStartedAt, startedAt, [interval]),
  };
}

function latestSampleBefore(receivedAt: string, samples: HrvAnalyticsSample[]): HrvAnalyticsSample | undefined {
  const markerMs = Date.parse(receivedAt);
  return [...samples]
    .filter((sample) => {
      const sampleMs = Date.parse(sample.receivedAt);
      return sampleMs <= markerMs && markerMs - sampleMs <= MARKER_SNAPSHOT_MAX_AGE_MS;
    })
    .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))[0];
}

function phaseAt(receivedAt: string, intervals: PauseInterval[]): ExperiencePhase {
  const timeMs = Date.parse(receivedAt);
  return intervals.some((interval) => timeMs >= interval.startMs && (interval.endMs === undefined || timeMs < interval.endMs))
    ? "paused"
    : "running";
}

function experienceTimeAt(receivedAt: string, startedAt: string, intervals: PauseInterval[]): number {
  const receivedMs = Date.parse(receivedAt);
  const startedMs = Date.parse(startedAt);
  const pausedBeforeMs = intervals.reduce((total, interval) => {
    if (receivedMs <= interval.startMs) {
      return total;
    }
    const intervalEnd = interval.endMs === undefined ? receivedMs : Math.min(interval.endMs, receivedMs);
    return total + Math.max(0, intervalEnd - interval.startMs);
  }, 0);
  return Math.max(0, receivedMs - startedMs - pausedBeforeMs);
}

function isWithinRunWindow(receivedAt: string, run: ExperienceRunState): boolean {
  if (!run.startedAt || Date.parse(receivedAt) < Date.parse(run.startedAt)) {
    return false;
  }
  return !run.endedAt || Date.parse(receivedAt) <= Date.parse(run.endedAt);
}

function phaseFromPayload(payload: Record<string, unknown>): ExperiencePhase | null {
  const telemetry = readRecord(payload.telemetry);
  const state = (readString(payload.state) ?? readString(telemetry.state))?.toLowerCase();
  const status = (readString(payload.status) ?? readString(telemetry.status))?.toLowerCase();
  if (state === "paused" || status === "idle") {
    return "paused";
  }
  if (state === "running" || status === "online" || status === "busy") {
    return "running";
  }
  return null;
}

function signalStateFromSample(bpm: number | undefined, hrStatus: number | undefined): SensorSignalState {
  if (typeof hrStatus === "number" && hrStatus < 0) {
    return "poor";
  }
  if ((typeof bpm !== "number" || bpm <= 0) && typeof hrStatus === "number" && hrStatus <= 0) {
    return "poor";
  }
  if (hrStatus === 1) {
    return "streaming";
  }
  return "unknown";
}

function gapCount(samples: HrvAnalyticsSample[]): number {
  let count = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (Date.parse(samples[index].receivedAt) - Date.parse(samples[index - 1].receivedAt) > SENSOR_STREAM_GAP_MS) {
      count += 1;
    }
  }
  return count;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number";
}

function isPositiveNumber(value: number | undefined): value is number {
  return typeof value === "number" && value > 0;
}

function minValue(values: number[]): number | undefined {
  return values.length > 0 ? Math.min(...values) : undefined;
}

function maxValue(values: number[]): number | undefined {
  return values.length > 0 ? Math.max(...values) : undefined;
}

function averageValue(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return roundOneDecimal(values.reduce((total, value) => total + value, 0) / values.length);
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  const text = String(value);
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}
