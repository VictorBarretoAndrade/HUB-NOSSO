import type { KeyValueStorage } from "../lib/storage";
import type { ExperienceReport } from "./experienceReport";
import type { SubjectSnapshot } from "./subjectProfile";
import {
  CSQ_VR_ITEMS,
  IPQ_ITEMS,
  SENTIMENT_INTERVIEW_QUESTIONS,
  SUS_ITEMS,
  UTAUT2_CONSTRUCTS,
  UTAUT2_ITEMS,
} from "./surveyInstruments";
import type {
  CsqVrItemDefinition,
  Utaut2ConstructId,
  Utaut2Placeholders,
} from "./surveyInstruments";

export const SURVEYS_STORAGE_KEY = "biofeedback-dashboard.surveys.v1";
export const SURVEYS_SCHEMA_VERSION = 1 as const;

export type SusAdjectiveRating =
  | "Worst Imaginable"
  | "Poor"
  | "OK"
  | "Good"
  | "Excellent"
  | "Best Imaginable";

export type SusGradeRating = "F" | "D" | "C" | "B" | "A";
export type SusAcceptabilityRating = "Not Acceptable" | "Marginal" | "Acceptable";
export type SusQuartileRating = "1st" | "2nd" | "3rd" | "4th";
export type SusNpsRating = "Detractor" | "Passive" | "Promoter";
export type SusBenchmarkRating = "Below Average" | "Above Average" | "Above Industry Standard";

export interface SusResult {
  /** Respostas brutas (1 a 5) para as 10 questões do SUS. */
  answers: [number, number, number, number, number, number, number, number, number, number];
  /** Escores ajustados por questão (0 a 10, equivalentes a (ans-1)*2.5 ou (5-ans)*2.5). */
  questionScores: [number, number, number, number, number, number, number, number, number, number];
  /** Escore final do SUS (0 a 100). */
  score: number;
  adjective: SusAdjectiveRating;
  grade: SusGradeRating;
  acceptability: SusAcceptabilityRating;
  quartile: SusQuartileRating;
  nps: SusNpsRating;
  benchmark: SusBenchmarkRating;
  completedAt: string;
}

export interface IpqResult {
  /** Respostas brutas (1 a 5) indexadas por ID do item (G1, SP1..SP5, INV1..INV4, REAL1..REAL4). */
  answers: Record<string, number>;
  /** Presença Geral (item G1 isolado, 1 a 5). */
  generalItem: number;
  /** Presença Espacial (SP, 1 a 5). */
  spatialPresence: number;
  /** Envolvimento (INV, 1 a 5). */
  involvement: number;
  /** Realismo Experenciado (REAL, 1 a 5). */
  experiencedRealism: number;
  /** Presença Global (média das 3 subescalas SP, INV, REAL, 1 a 5). */
  globalPresence: number;
  completedAt: string;
}

export type CsqVrAnswers = Record<CsqVrItemDefinition["id"], number>;

export interface CsqVrSubscores {
  /** Soma Nausea A + Nausea B (2 a 14). */
  nausea: number;
  /** Soma Vestibular A + Vestibular B (2 a 14). */
  vestibular: number;
  /** Soma Oculomotor A + Oculomotor B (2 a 14). */
  oculomotor: number;
  /** Soma total (6 a 42). */
  total: number;
}

export interface CsqVrResult {
  postAnswers: CsqVrAnswers;
  preAnswers?: CsqVrAnswers;
  post: CsqVrSubscores;
  pre?: CsqVrSubscores;
  delta?: CsqVrSubscores;
  /** Ponto de corte de referência da validação para versão VR (>= 9). */
  exceedsVrCutoff: boolean;
  /** Ponto de corte de referência da validação para versão impressa (>= 10). */
  exceedsPaperCutoff: boolean;
  completedAt: string;
}

export interface Utaut2Result {
  /** Respostas brutas (1 a 5) para os itens PE1..BI3. */
  answers: Record<string, number>;
  /** Escores compostos por construto (média aritmética 1 a 5). */
  constructs: Record<Utaut2ConstructId, number>;
  /** Média geral de aceitação (1 a 5). */
  overallScore: number;
  placeholders?: Utaut2Placeholders;
  completedAt: string;
}

export type SentimentPolarity = "positive" | "neutral" | "negative";
export type LikertCategory = "low" | "moderate" | "high";
export type ConvergencePattern =
  | "convergence"
  | "strong_divergence"
  | "soft_divergence"
  | "inverse_divergence"
  | "neutral_alignment";

export interface SentimentEntryScore {
  questionId: "feeling" | "engagement" | "distance";
  text: string;
  vaderScore: number;
  textblobScore: number;
  compositePc1: number;
  label: SentimentPolarity;
}

export interface SentimentLikertAnswers {
  presence: number;
  bodyEngagement: number;
  similarity: number;
}

export interface SentimentResult {
  entries: SentimentEntryScore[];
  likert: SentimentLikertAnswers;
  threshold: number;
  vaderAvg: number;
  textblobAvg: number;
  /** Escore composto médio do participante (avg_sentiment_pc1, -1 a +1). */
  avgSentimentPc1: number;
  /** Caso o pesquisador tenha informado/ajustado manualmente o escore vindo do Python notebook. */
  manualOverrideScore?: number;
  finalLabel: SentimentPolarity;
  patterns: {
    presence: ConvergencePattern;
    bodyEngagement: ConvergencePattern;
    similarity: ConvergencePattern;
  };
  completedAt: string;
}

export interface SurveySessionSummary {
  runId?: string;
  label?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  markerCount: number;
  sampleCount: number;
  bpmMin?: number;
  bpmAvg?: number;
  bpmMax?: number;
  rrAvgMs?: number;
  ibiSampleCount: number;
  sensorClientIds: string[];
}

export interface SubjectSurveyRecord {
  id: string;
  subjectId: string;
  /** Nome do sistema/ambiente avaliado (usado em comparações multi-estudo e no SUS Toolkit). */
  systemName: string;
  runId?: string;
  createdAt: string;
  updatedAt: string;
  subjectSnapshot?: SubjectSnapshot;
  sessionSummary?: SurveySessionSummary;
  sus?: SusResult;
  ipq?: IpqResult;
  csqVr?: CsqVrResult;
  utaut2?: Utaut2Result;
  sentiment?: SentimentResult;
}

export interface PersistedSurveyStore {
  schemaVersion: typeof SURVEYS_SCHEMA_VERSION;
  updatedAt: string;
  records: SubjectSurveyRecord[];
}

// ---------------------------------------------------------------------------
// SUS Calculations (exact match with sus-analysis-toolkit / Brooke 1996)
// ---------------------------------------------------------------------------

export function getSusAdjective(score: number): SusAdjectiveRating {
  if (score < 25.1) return "Worst Imaginable";
  if (score < 51.7) return "Poor";
  if (score < 71.1) return "OK";
  if (score < 80.8) return "Good";
  if (score < 84.1) return "Excellent";
  return "Best Imaginable";
}

export function getSusGrade(score: number): SusGradeRating {
  if (score < 51.6) return "F";
  if (score < 62.6) return "D";
  if (score < 72.5) return "C";
  if (score < 78.8) return "B";
  return "A";
}

export function getSusAcceptability(score: number): SusAcceptabilityRating {
  if (score < 51.7) return "Not Acceptable";
  if (score < 72.6) return "Marginal";
  return "Acceptable";
}

export function getSusQuartile(score: number): SusQuartileRating {
  if (score < 62.5) return "1st";
  if (score < 71.0) return "2nd";
  if (score < 78.0) return "3rd";
  return "4th";
}

export function getSusNps(score: number): SusNpsRating {
  if (score < 62.5) return "Detractor";
  if (score < 78.8) return "Passive";
  return "Promoter";
}

export function getSusBenchmark(score: number): SusBenchmarkRating {
  if (score < 68.0) return "Below Average";
  if (score < 80.0) return "Above Average";
  return "Above Industry Standard";
}

export function calculateSusResult(
  rawAnswers: number[],
  completedAt = new Date().toISOString(),
): SusResult {
  const clamped = SUS_ITEMS.map((_, idx) => clampInt(rawAnswers[idx] ?? 3, 1, 5)) as SusResult["answers"];
  const questionScores = clamped.map((val, idx) => {
    const isOdd = (idx + 1) % 2 === 1;
    const adjusted = isOdd ? val - 1 : 5 - val;
    return round2(adjusted * 2.5);
  }) as SusResult["questionScores"];
  const score = round2(questionScores.reduce((acc, item) => acc + item, 0));

  return {
    answers: clamped,
    questionScores,
    score,
    adjective: getSusAdjective(score),
    grade: getSusGrade(score),
    acceptability: getSusAcceptability(score),
    quartile: getSusQuartile(score),
    nps: getSusNps(score),
    benchmark: getSusBenchmark(score),
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// IPQ Calculations (Schubert et al. 2001, Section 3.2 of Toolkit)
// ---------------------------------------------------------------------------

export function calculateIpqResult(
  rawAnswers: Record<string, number>,
  completedAt = new Date().toISOString(),
): IpqResult {
  const answers: Record<string, number> = {};
  for (const item of IPQ_ITEMS) {
    answers[item.id] = clampInt(rawAnswers[item.id] ?? 3, 1, 5);
  }

  const g1 = answers.G1;
  const sp1 = answers.SP1;
  const sp2 = 6 - answers.SP2;
  const sp3 = 6 - answers.SP3;
  const sp4 = answers.SP4;
  const sp5 = answers.SP5;

  const inv1 = 6 - answers.INV1;
  const inv2 = answers.INV2;
  const inv3 = 6 - answers.INV3;
  const inv4 = answers.INV4;

  const real1 = answers.REAL1;
  const real2 = answers.REAL2;
  const real3 = answers.REAL3;
  const real4 = answers.REAL4;

  const spatialPresence = round2((g1 + sp1 + sp2 + sp3 + sp4 + sp5) / 6);
  const involvement = round2((inv1 + inv2 + inv3 + inv4) / 4);
  const experiencedRealism = round2((real1 + real2 + real3 + real4) / 4);
  const globalPresence = round2((spatialPresence + involvement + experiencedRealism) / 3);

  return {
    answers,
    generalItem: g1,
    spatialPresence,
    involvement,
    experiencedRealism,
    globalPresence,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// CSQ-VR Calculations (Kourtesis et al. 2023, Section 4.2 of Toolkit)
// ---------------------------------------------------------------------------

export function computeCsqVrSubscores(answers: Partial<CsqVrAnswers>): CsqVrSubscores {
  const nA = clampInt(answers.nauseaA ?? 1, 1, 7);
  const nB = clampInt(answers.nauseaB ?? 1, 1, 7);
  const vA = clampInt(answers.vestibularA ?? 1, 1, 7);
  const vB = clampInt(answers.vestibularB ?? 1, 1, 7);
  const oA = clampInt(answers.oculomotorA ?? 1, 1, 7);
  const oB = clampInt(answers.oculomotorB ?? 1, 1, 7);

  const nausea = nA + nB;
  const vestibular = vA + vB;
  const oculomotor = oA + oB;
  const total = nausea + vestibular + oculomotor;

  return { nausea, vestibular, oculomotor, total };
}

export function calculateCsqVrResult(
  postRaw: Partial<CsqVrAnswers>,
  preRaw?: Partial<CsqVrAnswers>,
  completedAt = new Date().toISOString(),
): CsqVrResult {
  const postAnswers: CsqVrAnswers = {
    nauseaA: clampInt(postRaw.nauseaA ?? 1, 1, 7),
    nauseaB: clampInt(postRaw.nauseaB ?? 1, 1, 7),
    vestibularA: clampInt(postRaw.vestibularA ?? 1, 1, 7),
    vestibularB: clampInt(postRaw.vestibularB ?? 1, 1, 7),
    oculomotorA: clampInt(postRaw.oculomotorA ?? 1, 1, 7),
    oculomotorB: clampInt(postRaw.oculomotorB ?? 1, 1, 7),
  };
  const post = computeCsqVrSubscores(postAnswers);

  let preAnswers: CsqVrAnswers | undefined;
  let pre: CsqVrSubscores | undefined;
  let delta: CsqVrSubscores | undefined;

  if (preRaw && CSQ_VR_ITEMS.some((item) => typeof preRaw[item.id] === "number")) {
    preAnswers = {
      nauseaA: clampInt(preRaw.nauseaA ?? 1, 1, 7),
      nauseaB: clampInt(preRaw.nauseaB ?? 1, 1, 7),
      vestibularA: clampInt(preRaw.vestibularA ?? 1, 1, 7),
      vestibularB: clampInt(preRaw.vestibularB ?? 1, 1, 7),
      oculomotorA: clampInt(preRaw.oculomotorA ?? 1, 1, 7),
      oculomotorB: clampInt(preRaw.oculomotorB ?? 1, 1, 7),
    };
    pre = computeCsqVrSubscores(preAnswers);
    delta = {
      nausea: post.nausea - pre.nausea,
      vestibular: post.vestibular - pre.vestibular,
      oculomotor: post.oculomotor - pre.oculomotor,
      total: post.total - pre.total,
    };
  }

  return {
    postAnswers,
    preAnswers,
    post,
    pre,
    delta,
    exceedsVrCutoff: post.total >= 9,
    exceedsPaperCutoff: post.total >= 10,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// UTAUT2 Calculations (Venkatesh et al. 2012, Section 5.3 of Toolkit)
// ---------------------------------------------------------------------------

export function calculateUtaut2Result(
  rawAnswers: Record<string, number>,
  placeholders?: Utaut2Placeholders,
  completedAt = new Date().toISOString(),
): Utaut2Result {
  const answers: Record<string, number> = {};
  for (const item of UTAUT2_ITEMS) {
    answers[item.id] = clampInt(rawAnswers[item.id] ?? 3, 1, 5);
  }

  const constructs = {} as Record<Utaut2ConstructId, number>;
  for (const construct of UTAUT2_CONSTRUCTS) {
    const items = UTAUT2_ITEMS.filter((item) => item.construct === construct.id);
    const sum = items.reduce((acc, item) => acc + (answers[item.id] ?? 3), 0);
    constructs[construct.id] = round2(sum / items.length);
  }

  const constructValues = Object.values(constructs);
  const overallScore = round2(
    constructValues.reduce((acc, val) => acc + val, 0) / constructValues.length,
  );

  return {
    answers,
    constructs,
    overallScore,
    placeholders,
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// Post-Exposure Sentiment Analysis (Section 6 of Toolkit: VADER + TextBlob PC1)
// ---------------------------------------------------------------------------

const BILINGUAL_SENTIMENT_LEXICON: Record<string, number> = {
  // Positive PT-BR
  excelente: 3.2,
  otimo: 3.0,
  otima: 3.0,
  bom: 2.0,
  boa: 2.0,
  incrivel: 3.3,
  maravilhoso: 3.2,
  maravilhosa: 3.2,
  realista: 2.4,
  imersivo: 2.6,
  imersiva: 2.6,
  imersao: 2.2,
  presente: 2.1,
  presenca: 2.0,
  natural: 2.1,
  intuitivo: 2.5,
  intuitiva: 2.5,
  facil: 2.2,
  claro: 1.8,
  clara: 1.8,
  seguro: 2.0,
  segura: 2.0,
  confiante: 2.4,
  confortavel: 2.3,
  agradavel: 2.4,
  divertido: 2.5,
  divertida: 2.5,
  prazeroso: 2.5,
  util: 2.2,
  eficiente: 2.3,
  eficaz: 2.2,
  fluido: 2.2,
  fluida: 2.2,
  preciso: 2.0,
  real: 1.8,
  gostei: 2.4,
  adorei: 3.1,
  envolvente: 2.6,
  engajado: 2.3,
  engajada: 2.3,
  atencao: 1.4,
  focado: 1.9,
  focada: 1.9,
  interessante: 2.1,
  positivo: 2.0,
  positiva: 2.0,
  satisfatorio: 2.0,
  // Negative PT-BR
  ruim: -2.5,
  pessimo: -3.3,
  pessima: -3.3,
  dificil: -2.1,
  complexo: -1.8,
  complexa: -1.8,
  confuso: -2.3,
  confusa: -2.3,
  inconsistente: -2.2,
  artificial: -2.0,
  falso: -2.1,
  irreal: -2.2,
  distante: -1.9,
  desconfortavel: -2.5,
  desconforto: -2.3,
  nausea: -2.8,
  tontura: -2.6,
  tonto: -2.5,
  vertigem: -2.7,
  dor: -2.5,
  cansaco: -1.9,
  cansado: -1.9,
  fadiga: -2.0,
  lento: -1.8,
  travando: -2.4,
  travou: -2.4,
  medo: -1.8,
  ansioso: -1.7,
  ansiedade: -1.8,
  inseguro: -2.1,
  insegura: -2.1,
  frustrante: -2.7,
  frustrado: -2.6,
  problema: -1.8,
  erro: -2.0,
  falha: -2.1,
  perdido: -1.9,
  estranho: -1.6,
  estranha: -1.6,
  incômodo: -2.2,
  incomodo: -2.2,
  // Positive EN
  excellent: 3.2,
  great: 3.0,
  good: 2.0,
  amazing: 3.3,
  wonderful: 3.2,
  realistic: 2.4,
  immersive: 2.6,
  immersion: 2.2,
  present: 2.0,
  presence: 2.0,
  intuitive: 2.5,
  easy: 2.2,
  clear: 1.8,
  safe: 2.0,
  confident: 2.4,
  comfortable: 2.3,
  enjoyable: 2.5,
  pleasant: 2.4,
  fun: 2.5,
  useful: 2.2,
  helpful: 2.1,
  smooth: 2.2,
  accurate: 2.0,
  liked: 2.2,
  loved: 3.1,
  engaging: 2.5,
  engaged: 2.3,
  focused: 1.9,
  interesting: 2.1,
  positive: 2.0,
  captivated: 2.7,
  // Negative EN
  bad: -2.5,
  terrible: -3.2,
  awful: -3.1,
  hard: -1.8,
  difficult: -2.1,
  complex: -1.8,
  confusing: -2.3,
  confused: -2.1,
  inconsistent: -2.2,
  fake: -2.2,
  unreal: -2.1,
  distant: -1.9,
  uncomfortable: -2.5,
  discomfort: -2.3,
  dizzy: -2.5,
  dizziness: -2.6,
  vertigo: -2.7,
  pain: -2.5,
  tired: -1.9,
  fatigue: -2.0,
  slow: -1.8,
  lag: -2.2,
  glitch: -2.2,
  fear: -1.8,
  anxious: -1.7,
  unsafe: -2.2,
  frustrating: -2.7,
  frustrated: -2.6,
  problem: -1.8,
  error: -2.0,
  lost: -1.9,
  weird: -1.6,
  awkward: -1.9,
  cumbersome: -2.3,
  distracted: -1.8,
};

const NEGATION_WORDS = new Set([
  "nao",
  "nunca",
  "jamais",
  "nem",
  "sem",
  "nenhum",
  "nenhuma",
  "not",
  "never",
  "no",
  "without",
  "hardly",
  "barely",
]);

const BOOSTER_WORDS: Record<string, number> = {
  muito: 0.35,
  bastante: 0.3,
  super: 0.35,
  extremamente: 0.45,
  totalmente: 0.35,
  completamente: 0.35,
  bem: 0.2,
  pouco: -0.3,
  levemente: -0.25,
  very: 0.35,
  extremely: 0.45,
  really: 0.3,
  totally: 0.35,
  completely: 0.35,
  quite: 0.2,
  slightly: -0.25,
  somewhat: -0.2,
};

function normalizeToken(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Estima escores VADER (compound) e TextBlob (polarity) para textos em PT-BR ou EN,
 * além do indicador composto PC1 (Seção 6.4 do SELECT-IVE Toolkit).
 */
export function analyzeTextSentiment(text: string): {
  vaderScore: number;
  textblobScore: number;
  compositePc1: number;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { vaderScore: 0, textblobScore: 0, compositePc1: 0 };
  }

  const rawTokens = trimmed.split(/\s+/);
  const tokens = rawTokens.map(normalizeToken).filter(Boolean);
  if (tokens.length === 0) {
    return { vaderScore: 0, textblobScore: 0, compositePc1: 0 };
  }

  const valences: number[] = [];
  const polarities: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const baseValence = BILINGUAL_SENTIMENT_LEXICON[token];
    if (typeof baseValence !== "number") {
      continue;
    }

    let valence = baseValence;
    const prev1 = i >= 1 ? tokens[i - 1] : "";
    const prev2 = i >= 2 ? tokens[i - 2] : "";

    if (prev1 && typeof BOOSTER_WORDS[prev1] === "number") {
      const boost = BOOSTER_WORDS[prev1];
      valence += valence >= 0 ? boost : -boost;
    }
    if ((prev1 && NEGATION_WORDS.has(prev1)) || (prev2 && NEGATION_WORDS.has(prev2))) {
      valence *= -0.74;
    }

    valences.push(valence);
    polarities.push(Math.max(-1, Math.min(1, valence / 3.4)));
  }

  if (valences.length === 0) {
    return { vaderScore: 0, textblobScore: 0, compositePc1: 0 };
  }

  const sumValence = valences.reduce((acc, v) => acc + v, 0);
  // Fórmula de normalização compound do VADER: x / sqrt(x^2 + alpha), alpha = 15
  const vaderScore = round4(sumValence / Math.sqrt(sumValence * sumValence + 15));
  // Polaridade média contínua no estilo TextBlob
  const textblobScore = round4(polarities.reduce((acc, p) => acc + p, 0) / polarities.length);
  const compositePc1 = round4((vaderScore + textblobScore) / 2);

  return { vaderScore, textblobScore, compositePc1 };
}

export function classifySentimentPolarity(score: number, threshold = 0.05): SentimentPolarity {
  if (score > threshold) return "positive";
  if (score < -threshold) return "negative";
  return "neutral";
}

export function classifyLikertCategory(value: number): LikertCategory {
  if (value >= 4) return "high";
  if (value <= 2) return "low";
  return "moderate";
}

export function classifyConvergencePattern(
  likertValue: number,
  sentimentLabel: SentimentPolarity,
): ConvergencePattern {
  const cat = classifyLikertCategory(likertValue);
  if (cat === "high" && sentimentLabel === "positive") return "convergence";
  if (cat === "low" && sentimentLabel === "negative") return "convergence";
  if (cat === "high" && sentimentLabel === "negative") return "strong_divergence";
  if (cat === "high" && sentimentLabel === "neutral") return "soft_divergence";
  if (cat === "low" && sentimentLabel === "positive") return "inverse_divergence";
  return "neutral_alignment";
}

export function calculateSentimentResult(
  input: {
    texts: Record<"feeling" | "engagement" | "distance", string>;
    likert: SentimentLikertAnswers;
    threshold?: number;
    manualOverrideScore?: number;
  },
  completedAt = new Date().toISOString(),
): SentimentResult {
  const threshold = typeof input.threshold === "number" && input.threshold >= 0 ? input.threshold : 0.05;
  const entries: SentimentEntryScore[] = SENTIMENT_INTERVIEW_QUESTIONS.map((q) => {
    const text = input.texts[q.id] ?? "";
    const { vaderScore, textblobScore, compositePc1 } = analyzeTextSentiment(text);
    return {
      questionId: q.id,
      text,
      vaderScore,
      textblobScore,
      compositePc1,
      label: classifySentimentPolarity(compositePc1, threshold),
    };
  });

  const nonEmptyEntries = entries.filter((entry) => entry.text.trim().length > 0);
  const pool = nonEmptyEntries.length > 0 ? nonEmptyEntries : entries;

  const vaderAvg = round4(pool.reduce((acc, e) => acc + e.vaderScore, 0) / pool.length);
  const textblobAvg = round4(pool.reduce((acc, e) => acc + e.textblobScore, 0) / pool.length);
  const computedAvgPc1 = round4(pool.reduce((acc, e) => acc + e.compositePc1, 0) / pool.length);
  const avgSentimentPc1 =
    typeof input.manualOverrideScore === "number" && Number.isFinite(input.manualOverrideScore)
      ? round4(Math.max(-1, Math.min(1, input.manualOverrideScore)))
      : computedAvgPc1;

  const finalLabel = classifySentimentPolarity(avgSentimentPc1, threshold);
  const likert: SentimentLikertAnswers = {
    presence: clampInt(input.likert.presence ?? 3, 1, 5),
    bodyEngagement: clampInt(input.likert.bodyEngagement ?? 3, 1, 5),
    similarity: clampInt(input.likert.similarity ?? 3, 1, 5),
  };

  return {
    entries,
    likert,
    threshold,
    vaderAvg,
    textblobAvg,
    avgSentimentPc1,
    manualOverrideScore: input.manualOverrideScore,
    finalLabel,
    patterns: {
      presence: classifyConvergencePattern(likert.presence, finalLabel),
      bodyEngagement: classifyConvergencePattern(likert.bodyEngagement, finalLabel),
      similarity: classifyConvergencePattern(likert.similarity, finalLabel),
    },
    completedAt,
  };
}

// ---------------------------------------------------------------------------
// Session Report Integration Helper
// ---------------------------------------------------------------------------

export function deriveSurveySessionSummary(report: ExperienceReport): SurveySessionSummary {
  const bpmMinValues = report.biometrics.map((b) => b.bpmMin).filter(isNumber);
  const bpmAvgValues = report.biometrics.map((b) => b.bpmAvg).filter(isNumber);
  const bpmMaxValues = report.biometrics.map((b) => b.bpmMax).filter(isNumber);
  const rrValues = report.biometrics.map((b) => b.rrAvgMs).filter(isNumber);

  return {
    runId: report.summary.runId,
    label: report.summary.label,
    startedAt: report.summary.startedAt,
    endedAt: report.summary.endedAt,
    durationMs: report.summary.durationMs,
    markerCount: report.summary.markerCount,
    sampleCount: report.biometrics.reduce((acc, b) => acc + b.sampleCount, 0),
    bpmMin: bpmMinValues.length > 0 ? Math.min(...bpmMinValues) : undefined,
    bpmAvg:
      bpmAvgValues.length > 0
        ? round2(bpmAvgValues.reduce((a, b) => a + b, 0) / bpmAvgValues.length)
        : undefined,
    bpmMax: bpmMaxValues.length > 0 ? Math.max(...bpmMaxValues) : undefined,
    rrAvgMs:
      rrValues.length > 0 ? round2(rrValues.reduce((a, b) => a + b, 0) / rrValues.length) : undefined,
    ibiSampleCount: report.biometrics.reduce((acc, b) => acc + b.ibiSampleCount, 0),
    sensorClientIds: report.biometrics.map((b) => b.sensorClientId),
  };
}

// ---------------------------------------------------------------------------
// Persistence & Sample Study Generator
// ---------------------------------------------------------------------------

export function loadSurveyRecords(storage: KeyValueStorage): SubjectSurveyRecord[] {
  const raw = storage.getItem(SURVEYS_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSurveyStore>;
    if (parsed.schemaVersion !== SURVEYS_SCHEMA_VERSION || !Array.isArray(parsed.records)) {
      return [];
    }
    return parsed.records.filter(
      (record): record is SubjectSurveyRecord =>
        Boolean(record && typeof record === "object" && typeof record.id === "string" && typeof record.subjectId === "string"),
    );
  } catch {
    return [];
  }
}

export function saveSurveyRecords(storage: KeyValueStorage, records: SubjectSurveyRecord[]): void {
  const payload: PersistedSurveyStore = {
    schemaVersion: SURVEYS_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    records,
  };
  storage.setItem(SURVEYS_STORAGE_KEY, JSON.stringify(payload));
}

export function upsertSurveyRecord(
  records: SubjectSurveyRecord[],
  incoming: SubjectSurveyRecord,
): SubjectSurveyRecord[] {
  const existingIdx = records.findIndex(
    (item) =>
      item.id === incoming.id ||
      (incoming.runId && item.runId === incoming.runId && item.subjectId === incoming.subjectId),
  );
  if (existingIdx === -1) {
    return [incoming, ...records];
  }
  const updated = [...records];
  updated[existingIdx] = {
    ...updated[existingIdx],
    ...incoming,
    updatedAt: incoming.updatedAt,
  };
  return updated;
}

export function deleteSurveyRecord(records: SubjectSurveyRecord[], id: string): SubjectSurveyRecord[] {
  return records.filter((item) => item.id !== id);
}

/**
 * Gera o dataset demonstrativo de 14 participantes (SELECT-IVE Walkthrough — Treinamento em Altura)
 * com dados completos de sensores (HRV/BPM/RR) + SUS + IPQ + CSQ-VR + UTAUT2 + Análise de Sentimento.
 */
export function createSampleSurveyRecords(now = "2026-11-11T14:00:00.000Z"): SubjectSurveyRecord[] {
  const susRows: Array<[number, number, number, number, number, number, number, number, number, number]> = [
    [5, 1, 5, 1, 4, 2, 5, 1, 5, 2], // 92.5
    [4, 2, 4, 2, 4, 2, 4, 2, 4, 2], // 75.0
    [5, 2, 4, 1, 5, 1, 4, 2, 5, 2], // 87.5
    [4, 1, 5, 2, 4, 2, 5, 1, 4, 2], // 85.0
    [3, 2, 4, 2, 4, 3, 4, 2, 4, 3], // 67.5
    [5, 1, 5, 1, 5, 1, 5, 1, 4, 1], // 97.5
    [4, 2, 4, 2, 5, 2, 4, 1, 4, 2], // 80.0
    [4, 2, 5, 2, 4, 2, 4, 2, 5, 2], // 80.0
    [3, 3, 3, 2, 4, 3, 4, 2, 3, 3], // 60.0
    [5, 2, 4, 1, 4, 2, 5, 1, 5, 1], // 90.0
    [4, 1, 4, 2, 4, 2, 5, 2, 4, 2], // 80.0
    [5, 2, 5, 1, 4, 2, 4, 1, 5, 2], // 87.5
    [4, 2, 4, 3, 4, 2, 4, 2, 4, 3], // 70.0
    [4, 2, 4, 2, 4, 2, 5, 2, 4, 2], // 77.5
  ];

  const sentimentProfiles: Array<{
    feeling: string;
    engagement: string;
    distance: string;
    likert: SentimentLikertAnswers;
    bpmAvg: number;
    rrAvgMs: number;
  }> = [
    {
      feeling: "Senti-me muito presente e seguro durante todo o treinamento no ambiente virtual.",
      engagement: "A perspectiva de altura realista e o feedback visual claro tornaram a atividade muito envolvente.",
      distance: "Apenas o teleporte da plataforma pareceu um pouco rápido.",
      likert: { presence: 5, bodyEngagement: 5, similarity: 5 },
      bpmAvg: 84,
      rrAvgMs: 714,
    },
    {
      feeling: "A experiência foi ótima e bastante intuitiva para aprender o procedimento.",
      engagement: "Os controles fáceis e a sensação real de estar no topo do prédio ajudaram a manter o foco.",
      distance: "Nenhum problema relevante, foi bem natural.",
      likert: { presence: 4, bodyEngagement: 5, similarity: 4 },
      bpmAvg: 79,
      rrAvgMs: 759,
    },
    {
      feeling: "Muito imersivo e agradável, senti cautela real ao olhar para baixo na plataforma.",
      engagement: "A fidelidade visual dos equipamentos e a iluminação do cenário.",
      distance: "Sentir o cabo do headset às vezes lembrava o ambiente externo.",
      likert: { presence: 5, bodyEngagement: 4, similarity: 4 },
      bpmAvg: 88,
      rrAvgMs: 682,
    },
    {
      feeling: "Gostei bastante, o sistema é claro, fluido e transmite confiança.",
      engagement: "A lista de tarefas visível e os indicadores de progresso.",
      distance: "Algumas ferramentas atravessavam a parede sem colisão física.",
      likert: { presence: 4, bodyEngagement: 4, similarity: 4 },
      bpmAvg: 76,
      rrAvgMs: 789,
    },
    {
      feeling: "Senti um pouco de desconforto e tontura leve ao olhar para baixo, foi estranho no começo.",
      engagement: "A tarefa de inspeção em si exigiu atenção.",
      distance: "A transição brusca na subida da plataforma causou confusão e quebrou o realismo.",
      likert: { presence: 4, bodyEngagement: 4, similarity: 3 },
      bpmAvg: 95,
      rrAvgMs: 631,
    },
    {
      feeling: "Excelente simulação, muito realista e divertida de operar.",
      engagement: "A sensação de presença espacial e o retorno imediato das ações.",
      distance: "Nada me distanciou, fiquei totalmente focado.",
      likert: { presence: 5, bodyEngagement: 5, similarity: 5 },
      bpmAvg: 82,
      rrAvgMs: 731,
    },
    {
      feeling: "A sensação foi normal, cumpri as etapas conforme solicitado no protocolo.",
      engagement: "O painel de instruções com as etapas de subida e descida.",
      distance: "Faltou indicar melhor qual ferramenta usar em cada passo.",
      likert: { presence: 4, bodyEngagement: 4, similarity: 4 },
      bpmAvg: 74,
      rrAvgMs: 810,
    },
    {
      feeling: "Boa experiência imersiva, senti meu corpo ajustar a postura na borda da plataforma.",
      engagement: "A sensação de altura e o alerta de segurança quando o clima mudou.",
      distance: "O movimento de subida foi instantâneo em vez de contínuo.",
      likert: { presence: 4, bodyEngagement: 5, similarity: 4 },
      bpmAvg: 86,
      rrAvgMs: 697,
    },
    {
      feeling: "Achei confuso no início e senti fadiga visual e leve insegurança nos comandos.",
      engagement: "O cenário do canteiro de obras.",
      distance: "Não consegui revisar os EPIs antes de subir e fiquei frustrado com a falta de aviso.",
      likert: { presence: 4, bodyEngagement: 3, similarity: 3 },
      bpmAvg: 98,
      rrAvgMs: 612,
    },
    {
      feeling: "Adorei a experiência, muito útil e eficiente para treinamento de segurança.",
      engagement: "O realismo da altura e a facilidade de interagir com os comandos.",
      distance: "Poucos detalhes visuais nas ferramentas secundárias.",
      likert: { presence: 5, bodyEngagement: 4, similarity: 5 },
      bpmAvg: 81,
      rrAvgMs: 740,
    },
    {
      feeling: "Senti-me confiante e confortável interagindo com o ambiente virtual.",
      engagement: "A barra de progresso verde e a clareza das decisões de segurança.",
      distance: "Ruído externo da sala apareceu levemente.",
      likert: { presence: 4, bodyEngagement: 4, similarity: 4 },
      bpmAvg: 77,
      rrAvgMs: 779,
    },
    {
      feeling: "Muito bom e envolvente, pareceu bastante próximo da atividade real.",
      engagement: "A reação postural ao vento e à altura simulada.",
      distance: "Subida sem animação gradual.",
      likert: { presence: 5, bodyEngagement: 5, similarity: 4 },
      bpmAvg: 85,
      rrAvgMs: 705,
    },
    {
      feeling: "A atividade ocorreu dentro do esperado, sem grandes emoções positivas ou negativas.",
      engagement: "A organização espacial do cenário.",
      distance: "A interação com os EPIs iniciais não deu confirmação sonora.",
      likert: { presence: 3, bodyEngagement: 3, similarity: 4 },
      bpmAvg: 73,
      rrAvgMs: 821,
    },
    {
      feeling: "Experiência positiva e agradável, fácil de aprender e muito interessante.",
      engagement: "A integração entre os alertas visuais e a tarefa em altura.",
      distance: "Pequena inconsistência física ao encostar objetos na estrutura.",
      likert: { presence: 4, bodyEngagement: 4, similarity: 4 },
      bpmAvg: 80,
      rrAvgMs: 750,
    },
  ];

  return susRows.map((susRow, idx) => {
    const pNum = String(idx + 1).padStart(2, "0");
    const subjectId = `P${pNum}`;
    const runId = `run-selective-${pNum}`;
    const profile = sentimentProfiles[idx];
    const sus = calculateSusResult(susRow, now);

    const highPresence = sus.score >= 80 ? 1 : 0;
    const ipq = calculateIpqResult(
      {
        G1: 4 + highPresence,
        SP1: 4 + (idx % 2),
        SP2: 2 - (idx % 2),
        SP3: 1 + (idx % 2),
        SP4: 4,
        SP5: 4 + highPresence,
        INV1: 2 + (idx % 2),
        INV2: 3 + (idx % 2),
        INV3: 2 + (idx % 3 === 0 ? 1 : 0),
        INV4: 4 + (idx % 2),
        REAL1: 3 + (idx % 2),
        REAL2: 4,
        REAL3: 3 + (idx % 2),
        REAL4: 2 + (idx % 3),
      },
      now,
    );

    const mildSickness = idx === 4 || idx === 8 ? 1 : 0;
    const csqVr = calculateCsqVrResult(
      {
        nauseaA: 1 + mildSickness,
        nauseaB: 1 + mildSickness + (idx % 2),
        vestibularA: 1 + mildSickness,
        vestibularB: 1 + (idx % 2),
        oculomotorA: 2 + mildSickness,
        oculomotorB: 1 + mildSickness + (idx % 3 === 0 ? 1 : 0),
      },
      {
        nauseaA: 1,
        nauseaB: 1,
        vestibularA: 1,
        vestibularB: 1,
        oculomotorA: 1 + (idx % 2),
        oculomotorB: 1,
      },
      now,
    );

    const baseAccept = sus.score >= 85 ? 5 : sus.score >= 75 ? 4 : 3;
    const utaut2 = calculateUtaut2Result(
      {
        PE1: baseAccept,
        PE2: Math.max(3, baseAccept - (idx % 2)),
        PE3: baseAccept,
        PE4: Math.min(5, baseAccept + (idx % 2)),
        EE1: baseAccept,
        EE2: baseAccept,
        EE3: Math.min(5, baseAccept + (idx % 3 === 0 ? 1 : 0)),
        EE4: Math.max(3, baseAccept - (idx % 3 === 1 ? 1 : 0)),
        SI1: 4 + (idx % 2),
        SI2: 4,
        SI3: 4 + (idx % 3 === 0 ? 1 : 0),
        FC1: 3 + (idx % 2),
        FC2: 4,
        FC3: 3 + (idx % 3 === 0 ? 1 : 0),
        FC4: 4,
        HM1: baseAccept,
        HM2: Math.min(5, baseAccept + 1),
        HM3: baseAccept,
        PV1: baseAccept,
        PV2: Math.max(3, baseAccept - (idx % 2)),
        PV3: baseAccept,
        HT1: Math.max(2, baseAccept - 1 + (idx % 2)),
        HT2: Math.max(2, baseAccept - (idx % 2)),
        HT3: baseAccept,
        BI1: baseAccept,
        BI2: Math.max(2, baseAccept - (idx % 2)),
        BI3: Math.min(5, baseAccept + (idx % 3 === 0 ? 1 : 0)),
      },
      undefined,
      now,
    );

    const sentiment = calculateSentimentResult(
      {
        texts: {
          feeling: profile.feeling,
          engagement: profile.engagement,
          distance: profile.distance,
        },
        likert: profile.likert,
        threshold: 0.05,
      },
      now,
    );

    return {
      id: `sample-${subjectId}`,
      subjectId,
      systemName: "NR-35 Treinamento em Altura (IVE)",
      runId,
      createdAt: now,
      updatedAt: now,
      subjectSnapshot: {
        schemaVersion: 2,
        subjectId,
        demographics: {
          ageYears: 24 + idx * 2,
          biologicalSex: idx % 2 === 0 ? "male" : "female",
          measurementPosition: "standing",
        },
        confounders: {
          sleepHours: 6.5 + (idx % 3) * 0.5,
          stressLevel: mildSickness ? "medium" : "low",
          conditions: ["none"],
        },
        consentAt: now,
        updatedAt: now,
      },
      sessionSummary: {
        runId,
        label: `Sessão NR-35 #${pNum}`,
        startedAt: "2026-11-11T13:30:00.000Z",
        endedAt: "2026-11-11T13:45:00.000Z",
        durationMs: 900_000,
        markerCount: 5 + (idx % 4),
        sampleCount: 880,
        bpmMin: profile.bpmAvg - 11,
        bpmAvg: profile.bpmAvg,
        bpmMax: profile.bpmAvg + 16,
        rrAvgMs: profile.rrAvgMs,
        ibiSampleCount: 880,
        sensorClientIds: ["polar-h10-01"],
      },
      sus,
      ipq,
      csqVr,
      utaut2,
      sentiment,
    };
  });
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
