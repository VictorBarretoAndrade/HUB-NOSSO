import { describe, expect, it } from "vitest";
import {
  computeCronbachAlpha,
  computeCsqVrStudyAnalytics,
  computeIpqStudyAnalytics,
  computeSentimentStudyAnalytics,
  computeSpearmanCorrelation,
  computeSusStudyAnalytics,
  computeUtaut2StudyAnalytics,
  getSusConclusivenessPercentage,
  parametrizeSusPercentile,
} from "./surveyAnalytics";
import {
  parseSurveyCsv,
  serializeSusToolkitCsv,
  serializeUnifiedSurveyCsv,
} from "./surveyCsv";
import {
  analyzeTextSentiment,
  calculateCsqVrResult,
  calculateIpqResult,
  calculateSentimentResult,
  calculateSusResult,
  calculateUtaut2Result,
  createSampleSurveyRecords,
} from "./surveys";

describe("surveys & SELECT-IVE / SUS Analysis Toolkit domain", () => {
  it("calculates SUS score and per-question scores identically to sus-analysis-toolkit Result.py", () => {
    // From sus-analysis-toolkit Result.py __main__: [3, 2, 5, 1, 4, 5, 3, 4, 5, 2]
    const res = calculateSusResult([3, 2, 5, 1, 4, 5, 3, 4, 5, 2]);
    expect(res.questionScores).toEqual([5, 7.5, 10, 10, 7.5, 0, 5, 2.5, 10, 7.5]);
    expect(res.score).toBe(65);
    expect(res.adjective).toBe("OK");
    expect(res.grade).toBe("C");
    expect(res.acceptability).toBe("Marginal");
  });

  it("computes SUS percentile and conclusiveness curves from sus-analysis-toolkit", () => {
    expect(parametrizeSusPercentile(68)).toBeGreaterThan(45);
    expect(parametrizeSusPercentile(80.71)).toBeGreaterThan(85);
    expect(getSusConclusivenessPercentage(5)).toBe(0);
    expect(getSusConclusivenessPercentage(6)).toBe(35);
    expect(getSusConclusivenessPercentage(8)).toBe(75);
    expect(getSusConclusivenessPercentage(10)).toBe(80);
    expect(getSusConclusivenessPercentage(12)).toBe(100);
    expect(getSusConclusivenessPercentage(14)).toBe(100);
  });

  it("calculates IPQ subscales with reversed items SP2, SP3, INV1, and INV3", () => {
    const ipq = calculateIpqResult({
      G1: 5,
      SP1: 5,
      SP2: 1, // reversed -> 5
      SP3: 1, // reversed -> 5
      SP4: 5,
      SP5: 5,
      INV1: 2, // reversed -> 4
      INV2: 4,
      INV3: 2, // reversed -> 4
      INV4: 4,
      REAL1: 3,
      REAL2: 3,
      REAL3: 3,
      REAL4: 3,
    });
    expect(ipq.spatialPresence).toBe(5);
    expect(ipq.involvement).toBe(4);
    expect(ipq.experiencedRealism).toBe(3);
    expect(ipq.globalPresence).toBe(4);
  });

  it("calculates CSQ-VR sub-scores, total, cut-offs, and pre/post delta", () => {
    const csq = calculateCsqVrResult(
      {
        nauseaA: 2,
        nauseaB: 2,
        vestibularA: 1,
        vestibularB: 2,
        oculomotorA: 2,
        oculomotorB: 2,
      },
      {
        nauseaA: 1,
        nauseaB: 1,
        vestibularA: 1,
        vestibularB: 1,
        oculomotorA: 1,
        oculomotorB: 1,
      },
    );
    expect(csq.post).toEqual({ nausea: 4, vestibular: 3, oculomotor: 4, total: 11 });
    expect(csq.pre).toEqual({ nausea: 2, vestibular: 2, oculomotor: 2, total: 6 });
    expect(csq.delta).toEqual({ nausea: 2, vestibular: 1, oculomotor: 2, total: 5 });
    expect(csq.exceedsVrCutoff).toBe(true);
    expect(csq.exceedsPaperCutoff).toBe(true);
  });

  it("calculates UTAUT2 construct means, Cronbach's Alpha, and Pearson correlations", () => {
    const utaut = calculateUtaut2Result({
      PE1: 5,
      PE2: 5,
      PE3: 4,
      PE4: 4,
      EE1: 4,
      EE2: 4,
      EE3: 4,
      EE4: 4,
    });
    expect(utaut.constructs.PE).toBe(4.5);
    expect(utaut.constructs.EE).toBe(4);

    const alpha = computeCronbachAlpha([
      [5, 4, 3, 5, 4, 2],
      [5, 4, 3, 5, 4, 2],
      [5, 4, 3, 4, 4, 2],
    ]);
    expect(alpha).not.toBeNull();
    expect(alpha!).toBeGreaterThan(0.9);
  });

  it("analyzes bilingual sentiment and detects convergence and divergence patterns", () => {
    const pos = analyzeTextSentiment("A experiência foi excelente, muito realista e divertida!");
    expect(pos.compositePc1).toBeGreaterThan(0.2);

    const neg = analyzeTextSentiment("Achei confuso, senti tontura e desconforto.");
    expect(neg.compositePc1).toBeLessThan(-0.2);

    const sent = calculateSentimentResult({
      texts: {
        feeling: "Senti desconforto e tontura ruim.",
        engagement: "Apenas olhei.",
        distance: "Muito confuso e frustrante.",
      },
      likert: { presence: 5, bodyEngagement: 4, similarity: 2 },
    });
    expect(sent.finalLabel).toBe("negative");
    expect(sent.patterns.presence).toBe("strong_divergence");
    expect(sent.patterns.similarity).toBe("convergence");
  });

  it("produces the 14-participant SELECT-IVE sample dataset with mean SUS ~80.71 and full analytics", () => {
    const sample = createSampleSurveyRecords();
    expect(sample).toHaveLength(14);

    const susAnalytics = computeSusStudyAnalytics(sample);
    expect(susAnalytics.sampleSize).toBe(14);
    expect(susAnalytics.stats.mean).toBeCloseTo(80.71, 2);
    expect(susAnalytics.conclusivenessPercentage).toBe(100);

    const ipqAnalytics = computeIpqStudyAnalytics(sample);
    expect(ipqAnalytics.sampleSize).toBe(14);
    expect(ipqAnalytics.spatialPresence.mean).toBeGreaterThan(ipqAnalytics.experiencedRealism.mean);

    const csqAnalytics = computeCsqVrStudyAnalytics(sample);
    expect(csqAnalytics.sampleSize).toBe(14);
    expect(csqAnalytics.preCount).toBe(14);

    const utautAnalytics = computeUtaut2StudyAnalytics(sample);
    expect(utautAnalytics.sampleSize).toBe(14);
    expect(utautAnalytics.constructs.PE.cronbachAlpha).not.toBeNull();

    const sentAnalytics = computeSentimentStudyAnalytics(sample);
    expect(sentAnalytics.sampleSize).toBe(14);
    expect(sentAnalytics.distribution.positive.count).toBe(10);
    expect(sentAnalytics.distribution.neutral.count).toBe(2);
    expect(sentAnalytics.distribution.negative.count).toBe(2);

    const spearman = computeSpearmanCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(spearman.rho).toBe(1);
  });

  it("exports and re-imports both sus-analysis-toolkit CSV and unified CSV formats", () => {
    const sample = createSampleSurveyRecords().slice(0, 3);
    const toolkitCsv = serializeSusToolkitCsv(sample);
    const parsedToolkit = parseSurveyCsv(toolkitCsv);
    expect(parsedToolkit.detectedFormat).toBe("sus-toolkit");
    expect(parsedToolkit.importedCount).toBe(3);
    expect(parsedToolkit.records[0].sus?.score).toBe(sample[0].sus?.score);

    const unifiedCsv = serializeUnifiedSurveyCsv(sample);
    const parsedUnified = parseSurveyCsv(unifiedCsv);
    expect(parsedUnified.detectedFormat).toBe("unified-or-instrument");
    expect(parsedUnified.importedCount).toBe(3);
    expect(parsedUnified.records[0].subjectId).toBe("P01");
    expect(parsedUnified.records[0].sessionSummary?.bpmAvg).toBe(sample[0].sessionSummary?.bpmAvg);
    expect(parsedUnified.records[0].sus?.score).toBe(sample[0].sus?.score);
    expect(parsedUnified.records[0].ipq?.globalPresence).toBe(sample[0].ipq?.globalPresence);
    expect(parsedUnified.records[0].csqVr?.post.total).toBe(sample[0].csqVr?.post.total);
    expect(parsedUnified.records[0].utaut2?.constructs.BI).toBe(sample[0].utaut2?.constructs.BI);
  });
});
