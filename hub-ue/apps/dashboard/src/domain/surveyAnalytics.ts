import {
  IPQ_ITEMS,
  SUS_ITEMS,
  UTAUT2_CONSTRUCTS,
  UTAUT2_ITEMS,
} from "./surveyInstruments";
import type { Utaut2ConstructId } from "./surveyInstruments";
import {
  getSusAcceptability,
  getSusAdjective,
  getSusBenchmark,
  getSusGrade,
  getSusNps,
  getSusQuartile,
} from "./surveys";
import type {
  SentimentPolarity,
  SubjectSurveyRecord,
  SusAcceptabilityRating,
  SusAdjectiveRating,
  SusBenchmarkRating,
  SusGradeRating,
  SusNpsRating,
  SusQuartileRating,
} from "./surveys";

export interface DescriptiveStats {
  count: number;
  mean: number;
  sd: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

export interface SusQuestionAnalytics {
  index: number;
  id: string;
  positive: boolean;
  meanScore: number;
  sdScore: number;
  /** Contagem de respostas brutas para [1, 2, 3, 4, 5]. */
  rawCounts: [number, number, number, number, number];
  /** Percentual (0 a 100) de respostas brutas para [1, 2, 3, 4, 5]. */
  rawPercentages: [number, number, number, number, number];
}

export interface SusStudyAnalytics {
  systemName: string;
  sampleSize: number;
  scores: number[];
  stats: DescriptiveStats;
  popSd: number;
  percentile: number;
  conclusivenessPercentage: number;
  adjective: SusAdjectiveRating;
  grade: SusGradeRating;
  acceptability: SusAcceptabilityRating;
  quartile: SusQuartileRating;
  nps: SusNpsRating;
  benchmark: SusBenchmarkRating;
  perQuestion: SusQuestionAnalytics[];
}

export interface IpqStudyAnalytics {
  sampleSize: number;
  spatialPresence: DescriptiveStats;
  involvement: DescriptiveStats;
  experiencedRealism: DescriptiveStats;
  globalPresence: DescriptiveStats;
  generalItem: DescriptiveStats;
  itemMeans: Record<string, number>;
}

export interface CsqVrStudyAnalytics {
  sampleSize: number;
  post: {
    nausea: DescriptiveStats;
    vestibular: DescriptiveStats;
    oculomotor: DescriptiveStats;
    total: DescriptiveStats;
  };
  preCount: number;
  pre?: {
    nausea: DescriptiveStats;
    vestibular: DescriptiveStats;
    oculomotor: DescriptiveStats;
    total: DescriptiveStats;
  };
  deltaMean?: {
    nausea: number;
    vestibular: number;
    oculomotor: number;
    total: number;
  };
  aboveVrCutoffCount: number;
  abovePaperCutoffCount: number;
}

export type CronbachAlphaInterpretation =
  | "Weak"
  | "Questionable"
  | "Acceptable"
  | "Good"
  | "Excellent"
  | "N/A";

export interface Utaut2ConstructAnalytics {
  id: Utaut2ConstructId;
  mean: number;
  sd: number;
  mode: number;
  cronbachAlpha: number | null;
  alphaInterpretation: CronbachAlphaInterpretation;
  correlations: Record<Utaut2ConstructId, number>;
}

export interface Utaut2ItemAnalytics {
  id: string;
  construct: Utaut2ConstructId;
  mean: number;
  mode: number;
  sd: number;
  percentages: [number, number, number, number, number];
}

export interface Utaut2StudyAnalytics {
  sampleSize: number;
  overallMean: number;
  constructs: Record<Utaut2ConstructId, Utaut2ConstructAnalytics>;
  items: Utaut2ItemAnalytics[];
}

export interface SpearmanCorrelationRow {
  dimensionId: string;
  labelPt: string;
  labelEn: string;
  n: number;
  rho: number;
  pValue: number;
  significant: boolean;
}

export interface DivergenceDimensionRow {
  dimensionId: "similarity" | "presence" | "bodyEngagement";
  labelPt: string;
  labelEn: string;
  convergence: number;
  strongDivergence: number;
  softDivergence: number;
  inverseDivergence: number;
  neutralAlignment: number;
}

export interface SentimentStudyAnalytics {
  sampleSize: number;
  avgPc1: number;
  sdPc1: number;
  distribution: Record<SentimentPolarity, { count: number; percentage: number }>;
  spearmanCorrelations: SpearmanCorrelationRow[];
  divergenceTable: DivergenceDimensionRow[];
}

// ---------------------------------------------------------------------------
// SUS Toolkit Functions (Sauro & Lewis 2016, Tullis & Stetson 2006)
// ---------------------------------------------------------------------------

/**
 * Curva parametrizada de percentil do sus-analysis-toolkit (Charts.py: parametrizePercentile).
 */
export function parametrizeSusPercentile(score: number): number {
  const a1 = 106.3;
  const b1 = 118;
  const c1 = 46.32;
  const a2 = 33.06;
  const b2 = 81.58;
  const c2 = 15.92;
  const raw =
    a1 * Math.exp(-Math.pow((score - b1) / c1, 2)) +
    a2 * Math.exp(-Math.pow((score - b2) / c2, 2));
  return round2(Math.max(0, Math.min(100, raw)));
}

export function getSusPercentileCurvePoints(steps = 100): Array<{ score: number; percentile: number }> {
  const points: Array<{ score: number; percentile: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const score = (i / steps) * 100;
    points.push({ score: round2(score), percentile: parametrizeSusPercentile(score) });
  }
  return points;
}

const CONCLUSIVENESS_LOOKUP: Record<number, number> = {
  0: 0,
  6: 35,
  7: 55,
  8: 75,
  9: 78,
  10: 80,
  11: 98,
  12: 100,
  13: 100,
  14: 100,
};

export function getSusConclusivenessPercentage(sampleSize: number): number {
  if (sampleSize < 6) return 0;
  if (sampleSize >= 12) return 100;
  return CONCLUSIVENESS_LOOKUP[sampleSize] ?? 0;
}

export const SUS_CONCLUSIVENESS_CURVE: Array<{ n: number; percentage: number }> = [
  { n: 6, percentage: 35 },
  { n: 8, percentage: 75 },
  { n: 10, percentage: 80 },
  { n: 12, percentage: 100 },
  { n: 14, percentage: 100 },
];

export function computeSusStudyAnalytics(
  records: SubjectSurveyRecord[],
  systemName = "Todos os sistemas",
): SusStudyAnalytics {
  const withSus = records.filter((r): r is SubjectSurveyRecord & { sus: NonNullable<SubjectSurveyRecord["sus"]> } =>
    Boolean(r.sus),
  );
  const scores = withSus.map((r) => r.sus.score);
  const stats = computeDescriptiveStats(scores);
  const popSd = computePopulationSd(scores);

  const perQuestion: SusQuestionAnalytics[] = SUS_ITEMS.map((item, qIdx) => {
    const qScores = withSus.map((r) => r.sus.questionScores[qIdx] ?? 0);
    const rawAnswers = withSus.map((r) => r.sus.answers[qIdx] ?? 3);
    const total = rawAnswers.length;
    const rawCounts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    for (const ans of rawAnswers) {
      if (ans >= 1 && ans <= 5) {
        rawCounts[ans - 1] += 1;
      }
    }
    const rawPercentages = rawCounts.map((count) =>
      total > 0 ? round2((count / total) * 100) : 0,
    ) as [number, number, number, number, number];

    return {
      index: item.index,
      id: item.id,
      positive: item.positive,
      meanScore: computeMean(qScores),
      sdScore: computeSampleSd(qScores),
      rawCounts,
      rawPercentages,
    };
  });

  return {
    systemName,
    sampleSize: withSus.length,
    scores,
    stats,
    popSd,
    percentile: scores.length > 0 ? parametrizeSusPercentile(stats.mean) : 0,
    conclusivenessPercentage: getSusConclusivenessPercentage(withSus.length),
    adjective: getSusAdjective(stats.mean),
    grade: getSusGrade(stats.mean),
    acceptability: getSusAcceptability(stats.mean),
    quartile: getSusQuartile(stats.mean),
    nps: getSusNps(stats.mean),
    benchmark: getSusBenchmark(stats.mean),
    perQuestion,
  };
}

// ---------------------------------------------------------------------------
// IPQ Study Analytics
// ---------------------------------------------------------------------------

export function computeIpqStudyAnalytics(records: SubjectSurveyRecord[]): IpqStudyAnalytics {
  const withIpq = records.filter((r): r is SubjectSurveyRecord & { ipq: NonNullable<SubjectSurveyRecord["ipq"]> } =>
    Boolean(r.ipq),
  );
  const itemMeans: Record<string, number> = {};
  for (const item of IPQ_ITEMS) {
    const vals = withIpq.map((r) => {
      const raw = r.ipq.answers[item.id] ?? 3;
      return item.reversed ? 6 - raw : raw;
    });
    itemMeans[item.id] = computeMean(vals);
  }

  return {
    sampleSize: withIpq.length,
    spatialPresence: computeDescriptiveStats(withIpq.map((r) => r.ipq.spatialPresence)),
    involvement: computeDescriptiveStats(withIpq.map((r) => r.ipq.involvement)),
    experiencedRealism: computeDescriptiveStats(withIpq.map((r) => r.ipq.experiencedRealism)),
    globalPresence: computeDescriptiveStats(withIpq.map((r) => r.ipq.globalPresence)),
    generalItem: computeDescriptiveStats(withIpq.map((r) => r.ipq.generalItem)),
    itemMeans,
  };
}

// ---------------------------------------------------------------------------
// CSQ-VR Study Analytics
// ---------------------------------------------------------------------------

export function computeCsqVrStudyAnalytics(records: SubjectSurveyRecord[]): CsqVrStudyAnalytics {
  const withCsq = records.filter(
    (r): r is SubjectSurveyRecord & { csqVr: NonNullable<SubjectSurveyRecord["csqVr"]> } => Boolean(r.csqVr),
  );
  const withPre = withCsq.filter((r) => Boolean(r.csqVr.pre));

  const post = {
    nausea: computeDescriptiveStats(withCsq.map((r) => r.csqVr.post.nausea)),
    vestibular: computeDescriptiveStats(withCsq.map((r) => r.csqVr.post.vestibular)),
    oculomotor: computeDescriptiveStats(withCsq.map((r) => r.csqVr.post.oculomotor)),
    total: computeDescriptiveStats(withCsq.map((r) => r.csqVr.post.total)),
  };

  let pre: CsqVrStudyAnalytics["pre"];
  let deltaMean: CsqVrStudyAnalytics["deltaMean"];

  if (withPre.length > 0) {
    pre = {
      nausea: computeDescriptiveStats(withPre.map((r) => r.csqVr.pre!.nausea)),
      vestibular: computeDescriptiveStats(withPre.map((r) => r.csqVr.pre!.vestibular)),
      oculomotor: computeDescriptiveStats(withPre.map((r) => r.csqVr.pre!.oculomotor)),
      total: computeDescriptiveStats(withPre.map((r) => r.csqVr.pre!.total)),
    };
    deltaMean = {
      nausea: round2(post.nausea.mean - pre.nausea.mean),
      vestibular: round2(post.vestibular.mean - pre.vestibular.mean),
      oculomotor: round2(post.oculomotor.mean - pre.oculomotor.mean),
      total: round2(post.total.mean - pre.total.mean),
    };
  }

  return {
    sampleSize: withCsq.length,
    post,
    preCount: withPre.length,
    pre,
    deltaMean,
    aboveVrCutoffCount: withCsq.filter((r) => r.csqVr.exceedsVrCutoff).length,
    abovePaperCutoffCount: withCsq.filter((r) => r.csqVr.exceedsPaperCutoff).length,
  };
}

// ---------------------------------------------------------------------------
// UTAUT2 Study Analytics (Cronbach's Alpha + Pearson Correlation Matrix)
// ---------------------------------------------------------------------------

export function interpretCronbachAlpha(alpha: number | null): CronbachAlphaInterpretation {
  if (alpha === null || !Number.isFinite(alpha)) return "N/A";
  if (alpha < 0.6) return "Weak";
  if (alpha < 0.7) return "Questionable";
  if (alpha < 0.8) return "Acceptable";
  if (alpha < 0.9) return "Good";
  return "Excellent";
}

/**
 * Calcula o Alfa de Cronbach: (k / (k - 1)) * (1 - sum(var_i) / var_total).
 */
export function computeCronbachAlpha(itemVectors: number[][]): number | null {
  const k = itemVectors.length;
  if (k < 2) return null;
  const n = itemVectors[0]?.length ?? 0;
  if (n < 2) return null;

  const itemVariances = itemVectors.map((vec) => computePopulationVariance(vec));
  const sumItemVar = itemVariances.reduce((a, b) => a + b, 0);

  const totalScores: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < k; j++) {
      sum += itemVectors[j][i] ?? 0;
    }
    totalScores.push(sum);
  }
  const totalVar = computePopulationVariance(totalScores);
  if (totalVar <= 1e-9) {
    return null;
  }

  const alpha = (k / (k - 1)) * (1 - sumItemVar / totalVar);
  return round2(Math.max(-1, Math.min(1, alpha)));
}

export function computePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const meanX = computeMean(x.slice(0, n));
  const meanY = computeMean(y.slice(0, n));

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den <= 1e-9) return 0;
  return round2(num / den);
}

export function computeUtaut2StudyAnalytics(records: SubjectSurveyRecord[]): Utaut2StudyAnalytics {
  const withUtaut = records.filter(
    (r): r is SubjectSurveyRecord & { utaut2: NonNullable<SubjectSurveyRecord["utaut2"]> } => Boolean(r.utaut2),
  );

  const constructSeries: Record<Utaut2ConstructId, number[]> = {
    PE: [],
    EE: [],
    SI: [],
    FC: [],
    HM: [],
    PV: [],
    HT: [],
    BI: [],
  };

  for (const r of withUtaut) {
    for (const c of UTAUT2_CONSTRUCTS) {
      constructSeries[c.id].push(r.utaut2.constructs[c.id]);
    }
  }

  const constructs = {} as Record<Utaut2ConstructId, Utaut2ConstructAnalytics>;
  for (const c of UTAUT2_CONSTRUCTS) {
    const itemsForConstruct = UTAUT2_ITEMS.filter((item) => item.construct === c.id);
    const itemVectors = itemsForConstruct.map((item) =>
      withUtaut.map((r) => r.utaut2.answers[item.id] ?? 3),
    );
    const alpha = computeCronbachAlpha(itemVectors);
    const correlations = {} as Record<Utaut2ConstructId, number>;
    for (const other of UTAUT2_CONSTRUCTS) {
      correlations[other.id] =
        c.id === other.id ? 1 : computePearsonCorrelation(constructSeries[c.id], constructSeries[other.id]);
    }

    constructs[c.id] = {
      id: c.id,
      mean: computeMean(constructSeries[c.id]),
      sd: computeSampleSd(constructSeries[c.id]),
      mode: computeMode(constructSeries[c.id].map((v) => Math.round(v))),
      cronbachAlpha: alpha,
      alphaInterpretation: interpretCronbachAlpha(alpha),
      correlations,
    };
  }

  const items: Utaut2ItemAnalytics[] = UTAUT2_ITEMS.map((item) => {
    const vals = withUtaut.map((r) => r.utaut2.answers[item.id] ?? 3);
    const total = vals.length;
    const counts = [0, 0, 0, 0, 0];
    for (const v of vals) {
      if (v >= 1 && v <= 5) counts[v - 1] += 1;
    }
    return {
      id: item.id,
      construct: item.construct,
      mean: computeMean(vals),
      mode: computeMode(vals),
      sd: computeSampleSd(vals),
      percentages: counts.map((c) => (total > 0 ? round2((c / total) * 100) : 0)) as [
        number,
        number,
        number,
        number,
        number,
      ],
    };
  });

  return {
    sampleSize: withUtaut.length,
    overallMean: computeMean(withUtaut.map((r) => r.utaut2.overallScore)),
    constructs,
    items,
  };
}

// ---------------------------------------------------------------------------
// Sentiment & Triangulation Analytics (Spearman rho + Convergence/Divergence)
// ---------------------------------------------------------------------------

/**
 * Calcula o coeficiente de correlação posto de Spearman (rho) com tratamento de empates
 * e aproximação bicaudal do p-valor (distribuição t de Student).
 */
export function computeSpearmanCorrelation(x: number[], y: number[]): { rho: number; pValue: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) {
    return { rho: 0, pValue: 1 };
  }
  const rankX = averageRanks(x.slice(0, n));
  const rankY = averageRanks(y.slice(0, n));
  const rho = computePearsonCorrelation(rankX, rankY);

  if (Math.abs(rho) >= 0.9999) {
    return { rho: rho > 0 ? 1 : -1, pValue: 0.0001 };
  }
  const df = n - 2;
  const tStat = Math.abs(rho) * Math.sqrt(df / (1 - rho * rho));
  const pValue = round4(studentTTwoTailedPValue(tStat, df));
  return { rho, pValue };
}

function averageRanks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) {
      j++;
    }
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

function studentTTwoTailedPValue(t: number, df: number): number {
  if (df <= 0 || !Number.isFinite(t)) return 1;
  // Aproximação normal corrigida para graus de liberdade (precisa para df >= 3)
  const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + (t * t) / (2 * df));
  const pOneTail = 0.5 * erfc(z / Math.SQRT2);
  return Math.max(0.0001, Math.min(1, 2 * pOneTail));
}

function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

export function computeSentimentStudyAnalytics(records: SubjectSurveyRecord[]): SentimentStudyAnalytics {
  const withSent = records.filter(
    (r): r is SubjectSurveyRecord & { sentiment: NonNullable<SubjectSurveyRecord["sentiment"]> } =>
      Boolean(r.sentiment),
  );
  const total = withSent.length;
  const pc1Scores = withSent.map((r) => r.sentiment.avgSentimentPc1);

  const counts: Record<SentimentPolarity, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };
  for (const r of withSent) {
    counts[r.sentiment.finalLabel] += 1;
  }

  const candidateDimensions: Array<{
    id: string;
    labelPt: string;
    labelEn: string;
    extract: (r: SubjectSurveyRecord) => number | undefined;
  }> = [
    {
      id: "presence",
      labelPt: "Presença (Likert Reflexivo)",
      labelEn: "Presence (Reflective Likert)",
      extract: (r) => r.sentiment?.likert.presence,
    },
    {
      id: "bodyEngagement",
      labelPt: "Engajamento Corporal (Likert)",
      labelEn: "Body Engagement (Likert)",
      extract: (r) => r.sentiment?.likert.bodyEngagement,
    },
    {
      id: "similarity",
      labelPt: "Similaridade com Tarefa Real (Likert)",
      labelEn: "Similarity to Real Task (Likert)",
      extract: (r) => r.sentiment?.likert.similarity,
    },
    {
      id: "susScore",
      labelPt: "Escore SUS (Usabilidade)",
      labelEn: "SUS Score (Usability)",
      extract: (r) => r.sus?.score,
    },
    {
      id: "ipqGlobal",
      labelPt: "IPQ Presença Global",
      labelEn: "IPQ Global Presence",
      extract: (r) => r.ipq?.globalPresence,
    },
    {
      id: "csqTotal",
      labelPt: "CSQ-VR Total (Cybersickness)",
      labelEn: "CSQ-VR Total (Cybersickness)",
      extract: (r) => r.csqVr?.post.total,
    },
    {
      id: "utaut2BI",
      labelPt: "UTAUT2 Intenção Comportamental (BI)",
      labelEn: "UTAUT2 Behavioral Intention (BI)",
      extract: (r) => r.utaut2?.constructs.BI,
    },
    {
      id: "bpmAvg",
      labelPt: "Sensor Biometria: BPM Médio",
      labelEn: "Sensor Biometrics: Mean BPM",
      extract: (r) => r.sessionSummary?.bpmAvg,
    },
    {
      id: "rrAvgMs",
      labelPt: "Sensor Biometria: RR Médio (ms)",
      labelEn: "Sensor Biometrics: Mean RR (ms)",
      extract: (r) => r.sessionSummary?.rrAvgMs,
    },
  ];

  const spearmanCorrelations: SpearmanCorrelationRow[] = [];
  for (const dim of candidateDimensions) {
    const pairs = withSent
      .map((r) => ({ sent: r.sentiment.avgSentimentPc1, val: dim.extract(r) }))
      .filter((pair): pair is { sent: number; val: number } => typeof pair.val === "number");
    if (pairs.length >= 3) {
      const { rho, pValue } = computeSpearmanCorrelation(
        pairs.map((p) => p.sent),
        pairs.map((p) => p.val),
      );
      spearmanCorrelations.push({
        dimensionId: dim.id,
        labelPt: dim.labelPt,
        labelEn: dim.labelEn,
        n: pairs.length,
        rho,
        pValue,
        significant: pValue < 0.05,
      });
    }
  }

  const divergenceDimensions: Array<{
    id: "similarity" | "presence" | "bodyEngagement";
    labelPt: string;
    labelEn: string;
  }> = [
    { id: "similarity", labelPt: "Similaridade com a tarefa real", labelEn: "Similarity to real task" },
    { id: "presence", labelPt: "Sensação de presença", labelEn: "Sense of presence" },
    { id: "bodyEngagement", labelPt: "Engajamento corporal", labelEn: "Body engagement" },
  ];

  const divergenceTable: DivergenceDimensionRow[] = divergenceDimensions.map((dim) => {
    let convergence = 0;
    let strongDivergence = 0;
    let softDivergence = 0;
    let inverseDivergence = 0;
    let neutralAlignment = 0;

    for (const r of withSent) {
      const pat = r.sentiment.patterns[dim.id];
      if (pat === "convergence") convergence++;
      else if (pat === "strong_divergence") strongDivergence++;
      else if (pat === "soft_divergence") softDivergence++;
      else if (pat === "inverse_divergence") inverseDivergence++;
      else neutralAlignment++;
    }

    return {
      dimensionId: dim.id,
      labelPt: dim.labelPt,
      labelEn: dim.labelEn,
      convergence,
      strongDivergence,
      softDivergence,
      inverseDivergence,
      neutralAlignment,
    };
  });

  return {
    sampleSize: total,
    avgPc1: computeMean(pc1Scores),
    sdPc1: computeSampleSd(pc1Scores),
    distribution: {
      positive: {
        count: counts.positive,
        percentage: total > 0 ? round2((counts.positive / total) * 100) : 0,
      },
      neutral: {
        count: counts.neutral,
        percentage: total > 0 ? round2((counts.neutral / total) * 100) : 0,
      },
      negative: {
        count: counts.negative,
        percentage: total > 0 ? round2((counts.negative / total) * 100) : 0,
      },
    },
    spearmanCorrelations,
    divergenceTable,
  };
}

// ---------------------------------------------------------------------------
// Statistical Primitives
// ---------------------------------------------------------------------------

export function computeDescriptiveStats(values: number[]): DescriptiveStats {
  const valid = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) {
    return { count: 0, mean: 0, sd: 0, min: 0, q1: 0, median: 0, q3: 0, max: 0 };
  }
  const sorted = [...valid].sort((a, b) => a - b);
  return {
    count: sorted.length,
    mean: computeMean(sorted),
    sd: computeSampleSd(sorted),
    min: round2(sorted[0]),
    q1: round2(computeQuantile(sorted, 0.25)),
    median: round2(computeQuantile(sorted, 0.5)),
    q3: round2(computeQuantile(sorted, 0.75)),
    max: round2(sorted[sorted.length - 1]),
  };
}

function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return round2(values.reduce((acc, v) => acc + v, 0) / values.length);
}

function computeSampleSd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (values.length - 1);
  return round2(Math.sqrt(variance));
}

function computePopulationSd(values: number[]): number {
  if (values.length === 0) return 0;
  return round2(Math.sqrt(computePopulationVariance(values)));
}

function computePopulationVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  return values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
}

function computeQuantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function computeMode(values: number[]): number {
  if (values.length === 0) return 0;
  const freq = new Map<number, number>();
  let bestVal = values[0];
  let bestCount = 0;
  for (const v of values) {
    const next = (freq.get(v) ?? 0) + 1;
    freq.set(v, next);
    if (next > bestCount) {
      bestCount = next;
      bestVal = v;
    }
  }
  return bestVal;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
