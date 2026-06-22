// Fase 1 — Tela de cadastro do sujeito (exigência ①).
//
// Componente controlado: lê `profile` e emite `onChange` com o perfil atualizado.
// O App mantém o estado e a persistência (localStorage via subjectProfile.ts).
// Coleta dados basais + fatores que afetam a HRV (confundidores) + consentimento.

import type {
  BiologicalSex,
  MeasurementPosition,
  StressLevel,
  SubjectConfounders,
  SubjectDemographics,
  SubjectProfile,
} from "./subjectProfile";
import { createEmptySubjectProfile, validateSubjectForStart } from "./subjectProfile";

const SEX_OPTIONS: Array<{ value: BiologicalSex; label: string }> = [
  { value: "female", label: "Feminino" },
  { value: "male", label: "Masculino" },
  { value: "intersex", label: "Intersexo" },
  { value: "undisclosed", label: "Não informado" },
];

const POSITION_OPTIONS: Array<{ value: MeasurementPosition; label: string }> = [
  { value: "sitting", label: "Sentado" },
  { value: "supine", label: "Deitado" },
  { value: "standing", label: "Em pé" },
];

const STRESS_OPTIONS: Array<{ value: StressLevel; label: string }> = [
  { value: "low", label: "Baixo" },
  { value: "medium", label: "Médio" },
  { value: "high", label: "Alto" },
];

function parseNumber(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function SubjectView({
  profile,
  onChange,
}: {
  profile: SubjectProfile | null;
  onChange: (next: SubjectProfile) => void;
}) {
  const current = profile ?? createEmptySubjectProfile();
  const issues = validateSubjectForStart(current);
  const ready = issues.length === 0;

  const update = (patch: Partial<SubjectProfile>) => onChange({ ...current, ...patch });
  const updateDemographics = (patch: Partial<SubjectDemographics>) =>
    onChange({ ...current, demographics: { ...current.demographics, ...patch } });
  const updateConfounders = (patch: Partial<SubjectConfounders>) =>
    onChange({ ...current, confounders: { ...current.confounders, ...patch } });

  return (
    <section className="content-grid subject-grid">
      <section className="panel">
        <header className="panel-header">
          <span>Cadastro do sujeito</span>
          <span className={`status-pill ${ready ? "ok" : "warn"}`}>
            {ready ? "Pronto para iniciar" : `${issues.length} pendência(s)`}
          </span>
        </header>
        <div className="panel-body">
          <p className="muted-copy">
            Use um identificador pseudônimo. Não registre dados pessoais identificáveis (LGPD).
          </p>
          <div className="form-block">
            <label htmlFor="subject-id">Subject ID (pseudônimo)</label>
            <input
              id="subject-id"
              maxLength={64}
              placeholder="S-2026-014"
              value={current.subjectId}
              onChange={(event) => update({ subjectId: event.target.value })}
            />

            <label htmlFor="subject-age">Idade (anos)</label>
            <input
              id="subject-age"
              type="number"
              min={0}
              max={120}
              value={current.demographics.ageYears ?? ""}
              onChange={(event) => updateDemographics({ ageYears: parseNumber(event.target.value) })}
            />

            <label htmlFor="subject-sex">Sexo biológico</label>
            <select
              id="subject-sex"
              value={current.demographics.biologicalSex ?? ""}
              onChange={(event) =>
                updateDemographics({ biologicalSex: (event.target.value || undefined) as BiologicalSex | undefined })
              }
            >
              <option value="">--</option>
              {SEX_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label htmlFor="subject-height">Altura (cm)</label>
            <input
              id="subject-height"
              type="number"
              min={0}
              value={current.demographics.heightCm ?? ""}
              onChange={(event) => updateDemographics({ heightCm: parseNumber(event.target.value) })}
            />

            <label htmlFor="subject-weight">Peso (kg)</label>
            <input
              id="subject-weight"
              type="number"
              min={0}
              value={current.demographics.weightKg ?? ""}
              onChange={(event) => updateDemographics({ weightKg: parseNumber(event.target.value) })}
            />

            <label htmlFor="subject-position">Posição de medição</label>
            <select
              id="subject-position"
              value={current.demographics.measurementPosition ?? ""}
              onChange={(event) =>
                updateDemographics({
                  measurementPosition: (event.target.value || undefined) as MeasurementPosition | undefined,
                })
              }
            >
              <option value="">--</option>
              {POSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>Fatores que afetam a HRV</span>
        </header>
        <div className="panel-body">
          <div className="form-block">
            <label htmlFor="subject-caffeine">Cafeína (horas desde a última dose)</label>
            <input
              id="subject-caffeine"
              type="number"
              min={0}
              value={current.confounders.caffeineHoursAgo ?? ""}
              onChange={(event) => updateConfounders({ caffeineHoursAgo: parseNumber(event.target.value) })}
            />

            <label htmlFor="subject-sleep">Sono na última noite (horas)</label>
            <input
              id="subject-sleep"
              type="number"
              min={0}
              value={current.confounders.sleepHours ?? ""}
              onChange={(event) => updateConfounders({ sleepHours: parseNumber(event.target.value) })}
            />

            <label htmlFor="subject-stress">Nível de estresse</label>
            <select
              id="subject-stress"
              value={current.confounders.stressLevel ?? ""}
              onChange={(event) =>
                updateConfounders({ stressLevel: (event.target.value || undefined) as StressLevel | undefined })
              }
            >
              <option value="">--</option>
              {STRESS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={current.confounders.alcoholLast24h ?? false}
                onChange={(event) => updateConfounders({ alcoholLast24h: event.target.checked })}
              />
              Consumiu álcool nas últimas 24h
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={current.confounders.exerciseRecent ?? false}
                onChange={(event) => updateConfounders({ exerciseRecent: event.target.checked })}
              />
              Exercício físico recente
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={current.confounders.nicotineRecent ?? false}
                onChange={(event) => updateConfounders({ nicotineRecent: event.target.checked })}
              />
              Nicotina recente
            </label>

            <label htmlFor="subject-medication">Medicação em uso</label>
            <input
              id="subject-medication"
              maxLength={120}
              placeholder="nenhuma"
              value={current.confounders.medication ?? ""}
              onChange={(event) => updateConfounders({ medication: event.target.value || undefined })}
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>Consentimento</span>
        </header>
        <div className="panel-body">
          <div className="form-block">
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={Boolean(current.consentAt)}
                onChange={(event) =>
                  update({ consentAt: event.target.checked ? new Date().toISOString() : undefined })
                }
              />
              Consinto com a coleta dos meus dados fisiológicos para esta sessão.
            </label>
            {!ready && (
              <ul className="required-list">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            <p className="muted-copy">
              O perfil é salvo localmente e anexado à experiência (lifecycle e relatório) ao iniciar.
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}
