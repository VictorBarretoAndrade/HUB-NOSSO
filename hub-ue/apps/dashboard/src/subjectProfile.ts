// Subject Registry — Fase 0 (contrato) + esqueleto.
//
// Cadastro pseudônimo da pessoa + questionário de fatores que afetam a HRV.
// Persistência espelha o padrão de experiencePersistence.ts (localStorage versionado).
// A LÓGICA de UI e de análise NÃO entra aqui — apenas o contrato e o plumbing.
//
// Ver PLANO-NOVAS-FEATURES.md (exigência ①).

export const SUBJECT_STORAGE_KEY = "biofeedback-dashboard.subject.v1";
export const SUBJECT_SCHEMA_VERSION = 2 as const;

export type BiologicalSex = "female" | "male" | "intersex" | "undisclosed";
export type Handedness = "left" | "right" | "ambidextrous";
export type MeasurementPosition = "sitting" | "supine" | "standing";
export type StressLevel = "low" | "medium" | "high";

export interface SubjectDemographics {
  ageYears?: number;
  biologicalSex?: BiologicalSex;
  heightCm?: number;
  weightKg?: number;
  handedness?: Handedness;
  measurementPosition?: MeasurementPosition;
}

/** Fatores fisiológicos que reconhecidamente afetam a HRV (confundidores). */
export interface SubjectConfounders {
  caffeineHoursAgo?: number;
  nicotineRecent?: boolean;
  alcoholLast24h?: boolean;
  sleepHours?: number;
  exerciseRecent?: boolean;
  lastMealHoursAgo?: number;
  medication?: string;
  stressLevel?: StressLevel;
  /** Condições relevantes; por convenção ["none"] quando não houver. */
  conditions: string[];
}

export interface SubjectProfile {
  schemaVersion: typeof SUBJECT_SCHEMA_VERSION;
  /** Pseudônimo — NUNCA dado pessoal identificável (LGPD). */
  subjectId: string;
  demographics: SubjectDemographics;
  confounders: SubjectConfounders;
  /** ISO 8601; obrigatório para iniciar uma experiência. */
  consentAt?: string;
  updatedAt: string;
}

/** Snapshot imutável anexado ao ExperienceRun / payload de lifecycle. */
export type SubjectSnapshot = Readonly<SubjectProfile>;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createEmptySubjectProfile(now = new Date().toISOString()): SubjectProfile {
  return {
    schemaVersion: SUBJECT_SCHEMA_VERSION,
    subjectId: "",
    demographics: {},
    confounders: { conditions: [] },
    updatedAt: now,
  };
}

/** Retorna os problemas que impedem iniciar a experiência (vazio = ok). */
export function validateSubjectForStart(profile: SubjectProfile): string[] {
  const issues: string[] = [];
  if (!profile.subjectId.trim()) {
    issues.push("Informe um Subject ID (pseudônimo).");
  }
  if (!profile.consentAt) {
    issues.push("Consentimento é obrigatório para iniciar a coleta.");
  }
  // TODO(②/análise): regras extras (faixa etária plausível, posição definida, etc.).
  return issues;
}

/** Congela o perfil para embutir na run e no export (cópia defensiva). */
export function subjectSnapshotForRun(profile: SubjectProfile): SubjectSnapshot {
  return Object.freeze(structuredClone(profile));
}

export function saveSubjectProfile(storage: KeyValueStorage, profile: SubjectProfile): void {
  storage.setItem(SUBJECT_STORAGE_KEY, JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }));
}

export function loadSubjectProfile(storage: KeyValueStorage): SubjectProfile | null {
  const raw = storage.getItem(SUBJECT_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SubjectProfile>;
    if (parsed.schemaVersion !== SUBJECT_SCHEMA_VERSION || typeof parsed.subjectId !== "string") {
      return null;
    }
    return {
      schemaVersion: SUBJECT_SCHEMA_VERSION,
      subjectId: parsed.subjectId,
      demographics: parsed.demographics ?? {},
      confounders: { conditions: [], ...parsed.confounders },
      consentAt: parsed.consentAt,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearSubjectProfile(storage: KeyValueStorage): void {
  storage.removeItem(SUBJECT_STORAGE_KEY);
}
