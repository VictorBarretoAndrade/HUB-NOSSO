import type { SessionTimelineItem } from "./markers";

export type TimelineKindFilter = "all" | SessionTimelineItem["kind"];

export interface TimelineFilterState {
  source: string;
  kind: TimelineKindFilter;
  query: string;
}

export interface TimelineFilterOptions {
  sources: string[];
  kinds: SessionTimelineItem["kind"][];
}

export const MARKER_PRESETS = [
  "stimulus-start",
  "stimulus-end",
  "interaction",
  "checkpoint",
  "issue",
  "note",
] as const;

const CSV_COLUMNS = [
  "receivedAt",
  "sessionTimeMs",
  "kind",
  "title",
  "detail",
  "source",
  "sourceClientId",
  "commandId",
  "tone",
] as const;

type ExportTimelineItem = Pick<
  SessionTimelineItem,
  "receivedAt" | "sessionTimeMs" | "kind" | "title" | "detail" | "source" | "sourceClientId" | "commandId" | "tone"
> & Pick<SessionTimelineItem, "biometricSnapshot">;

export function deriveTimelineFilterOptions(items: SessionTimelineItem[]): TimelineFilterOptions {
  return {
    sources: uniqueSorted(items.map(timelineSource).filter(Boolean)),
    kinds: uniqueSorted(items.map((item) => item.kind)),
  };
}

export function filterSessionTimeline<T extends SessionTimelineItem>(items: T[], filters: TimelineFilterState): T[] {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.source !== "all" && timelineSource(item) !== filters.source) {
      return false;
    }
    if (filters.kind !== "all" && item.kind !== filters.kind) {
      return false;
    }
    if (!query) {
      return true;
    }
    return query.split(/\s+/).every((part) => searchableText(item).includes(part));
  });
}

export function serializeTimelineJson(items: SessionTimelineItem[]): string {
  return JSON.stringify(items.map(toExportItem), null, 2);
}

export function serializeTimelineCsv(items: SessionTimelineItem[]): string {
  const rows = items.map((item) => {
    const exportItem = toExportItem(item);
    return CSV_COLUMNS.map((column) => csvCell(exportItem[column])).join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

function toExportItem(item: SessionTimelineItem): ExportTimelineItem {
  return {
    receivedAt: item.receivedAt,
    sessionTimeMs: item.sessionTimeMs,
    kind: item.kind,
    title: item.title,
    detail: item.detail,
    source: item.source,
    sourceClientId: item.sourceClientId,
    commandId: item.commandId,
    tone: item.tone,
    biometricSnapshot: item.biometricSnapshot,
  };
}

function searchableText(item: SessionTimelineItem): string {
  const snapshot = item.biometricSnapshot;
  return [
    item.title,
    item.detail,
    item.source ?? "",
    item.sourceClientId,
    item.commandId ?? "",
    snapshot?.sensorClientId ?? "",
    typeof snapshot?.bpm === "number" ? `bpm ${snapshot.bpm}` : "",
    typeof snapshot?.rrMs === "number" ? `rr ${snapshot.rrMs}` : "",
    snapshot?.signalState ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function timelineSource(item: SessionTimelineItem): string {
  return item.source ?? item.sourceClientId;
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
