/** Formatadores de exibição. Valor ausente vira "--" para manter as colunas alinhadas. */

const LOCALE = "pt-BR";

export function formatBpm(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "--";
}

export function formatRrMs(value: number | undefined): string {
  return typeof value === "number" ? `${value} ms` : "--";
}

export function formatSamplesPerMinute(value: number | undefined): string {
  return typeof value === "number" ? `${value}/min` : "--";
}

export function formatBpmRange(min: number | undefined, avg: number | undefined, max: number | undefined): string {
  if (typeof min !== "number" || typeof avg !== "number" || typeof max !== "number") {
    return "--";
  }
  return `${Math.round(min)} / ${formatReportNumber(avg)} / ${Math.round(max)}`;
}

export function formatReportNumber(value: number | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatReportMs(value: number | undefined): string {
  return typeof value === "number" ? `${formatReportNumber(value)} ms` : "--";
}

export function formatCelsius(value: number | undefined): string {
  return typeof value === "number" ? `${formatReportNumber(value)} °C` : "--";
}

export function formatPercent(value: number | undefined): string {
  return typeof value === "number" ? `${formatReportNumber(value)}%` : "--";
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(LOCALE, { hour12: false });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(LOCALE, {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  });
}

export function formatDuration(value: number | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(2)} s`;
}

export function formatSessionMs(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(1)} s`;
}
