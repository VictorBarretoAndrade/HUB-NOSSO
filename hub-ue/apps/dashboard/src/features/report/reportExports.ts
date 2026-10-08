import type { CaptureProfile } from "../../domain/captureProfile";
import type { CommandHistoryItem } from "../../domain/commandHistory";
import { serializeBiometricsTimelineCsv } from "../../domain/experienceAnalytics";
import {
  serializeBiometricsSummaryCsv,
  serializeExperienceReportCsv,
  serializeExperienceReportJson,
  serializeMarkerSnapshotsCsv,
} from "../../domain/experienceReport";
import type { ExperienceReport } from "../../domain/experienceReport";
import { serializeExperienceRunCsv } from "../../domain/experienceRun";
import type { AnalyticSessionTimelineItem, ExperienceRunState } from "../../domain/experienceRun";
import type { SubjectSnapshot } from "../../domain/subjectProfile";
import { fileTimestamp } from "../../lib/download";

export type ReportFormat = "json" | "csv";
export type ReportCsvKind = "markers" | "biometrics" | "biometrics-timeline";

export interface ExportFile {
  filename: string;
  content: string;
  mimeType: string;
}

export interface ReportExportContext {
  timeline: AnalyticSessionTimelineItem[];
  commandHistory: CommandHistoryItem[];
  subject?: SubjectSnapshot;
  capture?: CaptureProfile;
}

const MIME_TYPE: Record<ReportFormat, string> = { json: "application/json", csv: "text/csv" };

/** Relatório completo: o JSON carrega timeline, comandos e o contexto (sujeito + captura). */
export function buildReportFile(report: ExperienceReport, format: ReportFormat, context: ReportExportContext): ExportFile {
  const exportedAt = new Date().toISOString();
  return {
    filename: `biofeedback-experience-report-${fileTimestamp(exportedAt)}.${format}`,
    content: format === "json" ? serializeExperienceReportJson(report, exportedAt, context) : serializeExperienceReportCsv(report),
    mimeType: MIME_TYPE[format],
  };
}

export function buildReportCsvFile(report: ExperienceReport, kind: ReportCsvKind): ExportFile {
  const serializers: Record<ReportCsvKind, () => string> = {
    markers: () => serializeMarkerSnapshotsCsv(report),
    biometrics: () => serializeBiometricsSummaryCsv(report),
    "biometrics-timeline": () => serializeBiometricsTimelineCsv(report.analytics),
  };
  return {
    filename: `biofeedback-experience-${kind}-${fileTimestamp()}.csv`,
    content: serializers[kind](),
    mimeType: MIME_TYPE.csv,
  };
}

export function buildTimelineCsvFile(run: ExperienceRunState, timeline: AnalyticSessionTimelineItem[]): ExportFile {
  const exportedAt = new Date().toISOString();
  return {
    filename: `biofeedback-experience-all-${fileTimestamp(exportedAt)}.csv`,
    content: serializeExperienceRunCsv(run, timeline, exportedAt),
    mimeType: MIME_TYPE.csv,
  };
}
