import type { SensorTelemetrySummary } from "../../domain/sensorTelemetry";

export function sensorSummaryForClient(summaries: SensorTelemetrySummary[], clientId: string): SensorTelemetrySummary | null {
  return summaries.find((summary) => summary.clientId === clientId || summary.device === clientId) ?? null;
}

export function distinctSensorCount(
  summaries: Array<{ clientId: string }>,
  managedSensors: Array<{ sensorId: string }>,
): number {
  return new Set([
    ...summaries.map((summary) => summary.clientId),
    ...managedSensors.map((sensor) => sensor.sensorId),
  ]).size;
}
