import {
  CSQ_VR_ITEMS,
  IPQ_ITEMS,
  SUS_ITEMS,
  UTAUT2_CONSTRUCTS,
  UTAUT2_ITEMS,
} from "./surveyInstruments";
import {
  calculateCsqVrResult,
  calculateIpqResult,
  calculateSentimentResult,
  calculateSusResult,
  calculateUtaut2Result,
} from "./surveys";
import type { CsqVrAnswers, SubjectSurveyRecord } from "./surveys";

export type SurveyExportCsvKind =
  | "unified"
  | "sus-toolkit"
  | "ipq"
  | "csq-vr"
  | "utaut2"
  | "sentiment";

/**
 * Exporta no formato exato do sus-analysis-toolkit (separador ';', colunas Question 1..10;System).
 */
export function serializeSusToolkitCsv(records: SubjectSurveyRecord[]): string {
  const withSus = records.filter(
    (r): r is SubjectSurveyRecord & { sus: NonNullable<SubjectSurveyRecord["sus"]> } => Boolean(r.sus),
  );
  const header = [
    ...SUS_ITEMS.map((item) => `Question ${item.index}`),
    "System",
  ].join(";");
  const rows = withSus.map((r) =>
    [...r.sus.answers.map(String), sanitizeSemiCell(r.systemName || "Biofeedback Hub")].join(";"),
  );
  return [header, ...rows].join("\n");
}

export function serializeIpqCsv(records: SubjectSurveyRecord[]): string {
  const withIpq = records.filter(
    (r): r is SubjectSurveyRecord & { ipq: NonNullable<SubjectSurveyRecord["ipq"]> } => Boolean(r.ipq),
  );
  const header = [
    "subjectId",
    "runId",
    "systemName",
    ...IPQ_ITEMS.map((i) => i.id),
    "spatialPresence",
    "involvement",
    "experiencedRealism",
    "globalPresence",
  ];
  const rows = withIpq.map((r) =>
    [
      r.subjectId,
      r.runId ?? "",
      r.systemName,
      ...IPQ_ITEMS.map((i) => r.ipq.answers[i.id] ?? ""),
      r.ipq.spatialPresence,
      r.ipq.involvement,
      r.ipq.experiencedRealism,
      r.ipq.globalPresence,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function serializeCsqVrCsv(records: SubjectSurveyRecord[]): string {
  const withCsq = records.filter(
    (r): r is SubjectSurveyRecord & { csqVr: NonNullable<SubjectSurveyRecord["csqVr"]> } => Boolean(r.csqVr),
  );
  const header = [
    "subjectId",
    "runId",
    "systemName",
    ...CSQ_VR_ITEMS.map((i) => `post_${i.id}`),
    "post_nausea",
    "post_vestibular",
    "post_oculomotor",
    "post_total",
    ...CSQ_VR_ITEMS.map((i) => `pre_${i.id}`),
    "pre_nausea",
    "pre_vestibular",
    "pre_oculomotor",
    "pre_total",
    "delta_total",
  ];
  const rows = withCsq.map((r) =>
    [
      r.subjectId,
      r.runId ?? "",
      r.systemName,
      ...CSQ_VR_ITEMS.map((i) => r.csqVr.postAnswers[i.id]),
      r.csqVr.post.nausea,
      r.csqVr.post.vestibular,
      r.csqVr.post.oculomotor,
      r.csqVr.post.total,
      ...CSQ_VR_ITEMS.map((i) => r.csqVr.preAnswers?.[i.id] ?? ""),
      r.csqVr.pre?.nausea ?? "",
      r.csqVr.pre?.vestibular ?? "",
      r.csqVr.pre?.oculomotor ?? "",
      r.csqVr.pre?.total ?? "",
      r.csqVr.delta?.total ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function serializeUtaut2Csv(records: SubjectSurveyRecord[]): string {
  const withUtaut = records.filter(
    (r): r is SubjectSurveyRecord & { utaut2: NonNullable<SubjectSurveyRecord["utaut2"]> } => Boolean(r.utaut2),
  );
  const header = [
    "subjectId",
    "runId",
    "systemName",
    ...UTAUT2_ITEMS.map((i) => i.id),
    ...UTAUT2_CONSTRUCTS.map((c) => `construct_${c.id}`),
    "overallScore",
  ];
  const rows = withUtaut.map((r) =>
    [
      r.subjectId,
      r.runId ?? "",
      r.systemName,
      ...UTAUT2_ITEMS.map((i) => r.utaut2.answers[i.id] ?? ""),
      ...UTAUT2_CONSTRUCTS.map((c) => r.utaut2.constructs[c.id]),
      r.utaut2.overallScore,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function serializeSentimentCsv(records: SubjectSurveyRecord[]): string {
  const withSent = records.filter(
    (r): r is SubjectSurveyRecord & { sentiment: NonNullable<SubjectSurveyRecord["sentiment"]> } =>
      Boolean(r.sentiment),
  );
  const header = [
    "participant_id",
    "run_id",
    "avg_sentiment_pc1",
    "final_sentiment_label",
    "vader_avg",
    "textblob_avg",
    "presence",
    "body_engagement",
    "similarity",
    "feeling_text",
    "engagement_text",
    "distance_text",
  ];
  const rows = withSent.map((r) => {
    const feeling = r.sentiment.entries.find((e) => e.questionId === "feeling")?.text ?? "";
    const engagement = r.sentiment.entries.find((e) => e.questionId === "engagement")?.text ?? "";
    const distance = r.sentiment.entries.find((e) => e.questionId === "distance")?.text ?? "";
    return [
      r.subjectId,
      r.runId ?? "",
      r.sentiment.avgSentimentPc1,
      r.sentiment.finalLabel,
      r.sentiment.vaderAvg,
      r.sentiment.textblobAvg,
      r.sentiment.likert.presence,
      r.sentiment.likert.bodyEngagement,
      r.sentiment.likert.similarity,
      feeling,
      engagement,
      distance,
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

/**
 * Exporta o CSV unificado contendo Sujeito + Sensores da Sessão + Todos os 5 Formulários.
 */
export function serializeUnifiedSurveyCsv(records: SubjectSurveyRecord[]): string {
  const header = [
    "subjectId",
    "runId",
    "systemName",
    "ageYears",
    "biologicalSex",
    "sleepHours",
    "stressLevel",
    "durationMs",
    "markerCount",
    "sensorSampleCount",
    "bpmMin",
    "bpmAvg",
    "bpmMax",
    "rrAvgMs",
    "ibiSampleCount",
    "susScore",
    "susAdjective",
    "susGrade",
    "susAcceptability",
    ...SUS_ITEMS.map((i) => `SUS_Q${i.index}`),
    "ipqSpatialPresence",
    "ipqInvolvement",
    "ipqExperiencedRealism",
    "ipqGlobalPresence",
    ...IPQ_ITEMS.map((i) => `IPQ_${i.id}`),
    "csqNausea",
    "csqVestibular",
    "csqOculomotor",
    "csqTotal",
    "csqPreTotal",
    "csqDeltaTotal",
    ...CSQ_VR_ITEMS.map((i) => `CSQ_${i.id}`),
    ...UTAUT2_CONSTRUCTS.map((c) => `UTAUT2_${c.id}`),
    "utaut2Overall",
    ...UTAUT2_ITEMS.map((i) => `UTAUT2_${i.id}`),
    "sentimentPc1",
    "sentimentLabel",
    "sentimentPresence",
    "sentimentBodyEngagement",
    "sentimentSimilarity",
    "sentimentFeelingText",
    "sentimentEngagementText",
    "sentimentDistanceText",
  ];

  const rows = records.map((r) => {
    const feeling = r.sentiment?.entries.find((e) => e.questionId === "feeling")?.text ?? "";
    const engagement = r.sentiment?.entries.find((e) => e.questionId === "engagement")?.text ?? "";
    const distance = r.sentiment?.entries.find((e) => e.questionId === "distance")?.text ?? "";

    return [
      r.subjectId,
      r.runId ?? "",
      r.systemName,
      r.subjectSnapshot?.demographics.ageYears ?? "",
      r.subjectSnapshot?.demographics.biologicalSex ?? "",
      r.subjectSnapshot?.confounders.sleepHours ?? "",
      r.subjectSnapshot?.confounders.stressLevel ?? "",
      r.sessionSummary?.durationMs ?? "",
      r.sessionSummary?.markerCount ?? "",
      r.sessionSummary?.sampleCount ?? "",
      r.sessionSummary?.bpmMin ?? "",
      r.sessionSummary?.bpmAvg ?? "",
      r.sessionSummary?.bpmMax ?? "",
      r.sessionSummary?.rrAvgMs ?? "",
      r.sessionSummary?.ibiSampleCount ?? "",
      r.sus?.score ?? "",
      r.sus?.adjective ?? "",
      r.sus?.grade ?? "",
      r.sus?.acceptability ?? "",
      ...SUS_ITEMS.map((_, idx) => r.sus?.answers[idx] ?? ""),
      r.ipq?.spatialPresence ?? "",
      r.ipq?.involvement ?? "",
      r.ipq?.experiencedRealism ?? "",
      r.ipq?.globalPresence ?? "",
      ...IPQ_ITEMS.map((i) => r.ipq?.answers[i.id] ?? ""),
      r.csqVr?.post.nausea ?? "",
      r.csqVr?.post.vestibular ?? "",
      r.csqVr?.post.oculomotor ?? "",
      r.csqVr?.post.total ?? "",
      r.csqVr?.pre?.total ?? "",
      r.csqVr?.delta?.total ?? "",
      ...CSQ_VR_ITEMS.map((i) => r.csqVr?.postAnswers[i.id] ?? ""),
      ...UTAUT2_CONSTRUCTS.map((c) => r.utaut2?.constructs[c.id] ?? ""),
      r.utaut2?.overallScore ?? "",
      ...UTAUT2_ITEMS.map((i) => r.utaut2?.answers[i.id] ?? ""),
      r.sentiment?.avgSentimentPc1 ?? "",
      r.sentiment?.finalLabel ?? "",
      r.sentiment?.likert.presence ?? "",
      r.sentiment?.likert.bodyEngagement ?? "",
      r.sentiment?.likert.similarity ?? "",
      feeling,
      engagement,
      distance,
    ]
      .map(csvCell)
      .join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

export interface CsvImportSummary {
  records: SubjectSurveyRecord[];
  detectedFormat: "sus-toolkit" | "unified-or-instrument";
  importedCount: number;
}

/**
 * Importa CSV no formato do sus-analysis-toolkit (Question 1..10;System) ou CSV unificado/por instrumento.
 */
export function parseSurveyCsv(
  csvText: string,
  defaultSystemName = "Ambiente Virtual Importado",
  now = new Date().toISOString(),
): CsvImportSummary {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("O arquivo CSV precisa conter cabeçalho e pelo menos uma linha de dados.");
  }

  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  const rawHeaders = parseCsvRow(firstLine, delimiter).map((h) => h.trim());
  const lowerHeaders = rawHeaders.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ""));

  // Detecta se é o formato clássico do sus-analysis-toolkit (Question 1..Question 10;System)
  const isSusToolkit =
    lowerHeaders.includes("question1") &&
    lowerHeaders.includes("question10") &&
    !lowerHeaders.includes("subjectid") &&
    !lowerHeaders.includes("susq1");

  if (isSusToolkit) {
    const qIndices = SUS_ITEMS.map((item) =>
      lowerHeaders.findIndex((h) => h === `question${item.index}` || h === `q${item.index}`),
    );
    const sysIdx = lowerHeaders.findIndex((h) => h === "system");
    const records: SubjectSurveyRecord[] = [];

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const cells = parseCsvRow(lines[rowIdx], delimiter);
      if (cells.length < 10) continue;
      const answers = qIndices.map((idx, fallbackIdx) => {
        const val = Number(cells[idx >= 0 ? idx : fallbackIdx]);
        return Number.isFinite(val) ? val : 3;
      });
      const systemName = (sysIdx >= 0 ? cells[sysIdx]?.trim() : "") || defaultSystemName;
      const subjectId = `P${String(rowIdx).padStart(2, "0")}`;
      records.push({
        id: `import-sus-${rowIdx}-${Date.now()}`,
        subjectId,
        systemName,
        createdAt: now,
        updatedAt: now,
        sus: calculateSusResult(answers, now),
      });
    }

    return {
      records,
      detectedFormat: "sus-toolkit",
      importedCount: records.length,
    };
  }

  const colIndex = (candidates: string[]): number => {
    for (const c of candidates) {
      const norm = c.toLowerCase().replace(/[\s_-]+/g, "");
      const idx = lowerHeaders.findIndex((h) => h === norm);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const records: SubjectSurveyRecord[] = [];
  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const cells = parseCsvRow(lines[rowIdx], delimiter);
    if (cells.every((c) => !c.trim())) continue;

    const readStr = (candidates: string[]): string | undefined => {
      const idx = colIndex(candidates);
      const val = idx >= 0 ? cells[idx]?.trim() : undefined;
      return val ? val : undefined;
    };

    const readNum = (candidates: string[]): number | undefined => {
      const str = readStr(candidates);
      if (typeof str === "undefined") return undefined;
      const num = Number(str.replace(",", "."));
      return Number.isFinite(num) ? num : undefined;
    };

    const subjectId =
      readStr(["subjectId", "participant_id", "participantId", "subject", "id"]) ??
      `P${String(rowIdx).padStart(2, "0")}`;
    const runId = readStr(["runId", "run_id", "sessionId"]);
    const systemName = readStr(["systemName", "System", "system"]) ?? defaultSystemName;

    // SUS
    const susAnswers = SUS_ITEMS.map((item) =>
      readNum([`SUS_Q${item.index}`, `Question ${item.index}`, `Q${item.index}`]),
    );
    const hasSus = susAnswers.some((v) => typeof v === "number");
    const sus = hasSus
      ? calculateSusResult(
          susAnswers.map((v) => v ?? 3),
          now,
        )
      : undefined;

    // IPQ
    const ipqAnswers: Record<string, number> = {};
    let hasIpq = false;
    for (const item of IPQ_ITEMS) {
      const val = readNum([`IPQ_${item.id}`, item.id]);
      if (typeof val === "number") {
        hasIpq = true;
        ipqAnswers[item.id] = val;
      }
    }
    const ipq = hasIpq ? calculateIpqResult(ipqAnswers, now) : undefined;

    // CSQ-VR
    const csqPost: Partial<CsqVrAnswers> = {};
    const csqPre: Partial<CsqVrAnswers> = {};
    let hasCsq = false;
    for (const item of CSQ_VR_ITEMS) {
      const postVal = readNum([`CSQ_${item.id}`, `post_${item.id}`, item.id, item.label]);
      if (typeof postVal === "number") {
        hasCsq = true;
        csqPost[item.id] = postVal;
      }
      const preVal = readNum([`pre_${item.id}`, `CSQ_pre_${item.id}`]);
      if (typeof preVal === "number") {
        csqPre[item.id] = preVal;
      }
    }
    const csqVr = hasCsq ? calculateCsqVrResult(csqPost, csqPre, now) : undefined;

    // UTAUT2
    const utautAnswers: Record<string, number> = {};
    let hasUtaut = false;
    for (const item of UTAUT2_ITEMS) {
      const val = readNum([`UTAUT2_${item.id}`, item.id]);
      if (typeof val === "number") {
        hasUtaut = true;
        utautAnswers[item.id] = val;
      }
    }
    const utaut2 = hasUtaut ? calculateUtaut2Result(utautAnswers, undefined, now) : undefined;

    // Sentiment
    const feelingText = readStr(["sentimentFeelingText", "feeling_text", "feeling", "response_text"]) ?? "";
    const engagementText = readStr(["sentimentEngagementText", "engagement_text", "engagement"]) ?? "";
    const distanceText = readStr(["sentimentDistanceText", "distance_text", "distance"]) ?? "";
    const sentPc1 = readNum(["sentimentPc1", "avg_sentiment_pc1", "sentiment_pc1"]);
    const sentPresence = readNum(["sentimentPresence", "presence"]);
    const sentBody = readNum(["sentimentBodyEngagement", "body_engagement", "bodyEngagement"]);
    const sentSim = readNum(["sentimentSimilarity", "similarity"]);
    const hasSentiment =
      Boolean(feelingText || engagementText || distanceText) ||
      typeof sentPc1 === "number" ||
      typeof sentPresence === "number";

    const sentiment = hasSentiment
      ? calculateSentimentResult(
          {
            texts: {
              feeling: feelingText,
              engagement: engagementText,
              distance: distanceText,
            },
            likert: {
              presence: sentPresence ?? 4,
              bodyEngagement: sentBody ?? 4,
              similarity: sentSim ?? 4,
            },
            manualOverrideScore: sentPc1,
          },
          now,
        )
      : undefined;

    // Session Biometrics
    const bpmMin = readNum(["bpmMin", "bpm_min"]);
    const bpmAvg = readNum(["bpmAvg", "bpm_avg", "bpm"]);
    const bpmMax = readNum(["bpmMax", "bpm_max"]);
    const rrAvgMs = readNum(["rrAvgMs", "rr_avg_ms", "rrMs"]);
    const ibiSampleCount = readNum(["ibiSampleCount", "ibi_sample_count"]) ?? 0;
    const durationMs = readNum(["durationMs", "duration_ms"]) ?? 0;
    const markerCount = readNum(["markerCount", "marker_count"]) ?? 0;
    const sampleCount = readNum(["sensorSampleCount", "sampleCount"]) ?? 0;

    const hasSessionSummary =
      typeof bpmAvg === "number" || typeof rrAvgMs === "number" || durationMs > 0 || sampleCount > 0;

    records.push({
      id: `import-${subjectId}-${rowIdx}-${Date.now()}`,
      subjectId,
      systemName,
      runId,
      createdAt: now,
      updatedAt: now,
      sessionSummary: hasSessionSummary
        ? {
            runId,
            durationMs,
            markerCount,
            sampleCount,
            bpmMin,
            bpmAvg,
            bpmMax,
            rrAvgMs,
            ibiSampleCount,
            sensorClientIds: [],
          }
        : undefined,
      sus,
      ipq,
      csqVr,
      utaut2,
      sentiment,
    });
  }

  return {
    records,
    detectedFormat: "unified-or-instrument",
    importedCount: records.length,
  };
}

function parseCsvRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function sanitizeSemiCell(value: string): string {
  return value.replace(/[;\r\n]+/g, " ").trim();
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
