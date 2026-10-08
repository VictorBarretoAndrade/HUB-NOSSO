import { ArrowRight, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Notify } from "../../app/hooks/useToasts";
import type { View } from "../../app/navigation";
import { Dialog } from "../../components/Dialog";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import { createEmptySubjectProfile, validateSubjectForStart } from "../../domain/subjectProfile";
import type {
  BiologicalSex,
  MeasurementPosition,
  StressLevel,
  SubjectConfounders,
  SubjectDemographics,
  SubjectProfile,
} from "../../domain/subjectProfile";
import { formatDateTime } from "../../lib/format";
import { NumberField, SelectField } from "./SubjectFields";

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

interface SubjectViewProps {
  profile: SubjectProfile | null;
  notify: Notify;
  onChange: (next: SubjectProfile) => void;
  onClear: () => void;
  onNavigate: (view: View) => void;
}

/**
 * Cadastro pseudônimo do sujeito: dados basais, fatores que afetam a HRV e
 * consentimento. O perfil é anexado à experiência (lifecycle e relatório) ao iniciar.
 */
export function SubjectView({ notify, onChange, onClear, onNavigate, profile }: SubjectViewProps) {
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const current = profile ?? createEmptySubjectProfile();
  const issues = validateSubjectForStart(current);
  const isReady = issues.length === 0;
  const subjectIdMissing = profile !== null && !current.subjectId.trim();

  const update = (patch: Partial<SubjectProfile>) => onChange({ ...current, ...patch });
  const updateDemographics = (patch: Partial<SubjectDemographics>) =>
    onChange({ ...current, demographics: { ...current.demographics, ...patch } });
  const updateConfounders = (patch: Partial<SubjectConfounders>) =>
    onChange({ ...current, confounders: { ...current.confounders, ...patch } });

  const clearProfile = () => {
    setIsConfirmingClear(false);
    onClear();
    notify("Cadastro do sujeito apagado deste navegador.");
  };

  return (
    <>
      <section className="content-grid subject-grid">
        <Panel
          title="Cadastro do sujeito"
          action={
            <StatusPill
              tone={isReady ? "ok" : "warn"}
              label={isReady ? "Pronto para iniciar" : issues.length === 1 ? "1 pendência" : `${issues.length} pendências`}
            />
          }
        >
          <p className="muted-copy">
            Use um identificador pseudônimo. Não registre dados pessoais identificáveis (LGPD).
          </p>
          <div className="form-block">
            <label htmlFor="subject-id">Subject ID (pseudônimo) — obrigatório</label>
            <input
              aria-describedby={subjectIdMissing ? "subject-id-error" : undefined}
              aria-invalid={subjectIdMissing ? true : undefined}
              aria-required
              autoComplete="off"
              id="subject-id"
              maxLength={64}
              placeholder="S-2026-014"
              value={current.subjectId}
              onChange={(event) => update({ subjectId: event.target.value })}
            />
            {subjectIdMissing && (
              <p className="field-error" id="subject-id-error">
                Informe um Subject ID para identificar esta coleta.
              </p>
            )}

            <NumberField
              id="subject-age"
              label="Idade (anos)"
              max={120}
              value={current.demographics.ageYears}
              onChange={(ageYears) => updateDemographics({ ageYears })}
            />
            <SelectField
              id="subject-sex"
              label="Sexo biológico"
              options={SEX_OPTIONS}
              value={current.demographics.biologicalSex}
              onChange={(biologicalSex) => updateDemographics({ biologicalSex })}
            />
            <NumberField
              id="subject-height"
              label="Altura (cm)"
              max={260}
              value={current.demographics.heightCm}
              onChange={(heightCm) => updateDemographics({ heightCm })}
            />
            <NumberField
              id="subject-weight"
              label="Peso (kg)"
              max={400}
              value={current.demographics.weightKg}
              onChange={(weightKg) => updateDemographics({ weightKg })}
            />
            <SelectField
              id="subject-position"
              label="Posição de medição"
              options={POSITION_OPTIONS}
              value={current.demographics.measurementPosition}
              onChange={(measurementPosition) => updateDemographics({ measurementPosition })}
            />
          </div>
        </Panel>

        <Panel title="Fatores que afetam a HRV">
          <div className="form-block">
            <NumberField
              id="subject-caffeine"
              label="Cafeína (horas desde a última dose)"
              max={72}
              value={current.confounders.caffeineHoursAgo}
              onChange={(caffeineHoursAgo) => updateConfounders({ caffeineHoursAgo })}
            />
            <NumberField
              id="subject-sleep"
              label="Sono na última noite (horas)"
              max={24}
              value={current.confounders.sleepHours}
              onChange={(sleepHours) => updateConfounders({ sleepHours })}
            />
            <SelectField
              id="subject-stress"
              label="Nível de estresse"
              options={STRESS_OPTIONS}
              value={current.confounders.stressLevel}
              onChange={(stressLevel) => updateConfounders({ stressLevel })}
            />

            <label className="checkbox-line">
              <input
                checked={current.confounders.alcoholLast24h ?? false}
                type="checkbox"
                onChange={(event) => updateConfounders({ alcoholLast24h: event.target.checked })}
              />
              Consumiu álcool nas últimas 24 h
            </label>
            <label className="checkbox-line">
              <input
                checked={current.confounders.exerciseRecent ?? false}
                type="checkbox"
                onChange={(event) => updateConfounders({ exerciseRecent: event.target.checked })}
              />
              Exercício físico recente
            </label>
            <label className="checkbox-line">
              <input
                checked={current.confounders.nicotineRecent ?? false}
                type="checkbox"
                onChange={(event) => updateConfounders({ nicotineRecent: event.target.checked })}
              />
              Nicotina recente
            </label>

            <label htmlFor="subject-medication">Medicação em uso</label>
            <input
              autoComplete="off"
              id="subject-medication"
              maxLength={120}
              placeholder="nenhuma"
              value={current.confounders.medication ?? ""}
              onChange={(event) => updateConfounders({ medication: event.target.value || undefined })}
            />
          </div>
        </Panel>

        <Panel title="Consentimento">
          <div className="form-block">
            <label className="checkbox-line">
              <input
                checked={Boolean(current.consentAt)}
                type="checkbox"
                onChange={(event) => update({ consentAt: event.target.checked ? new Date().toISOString() : undefined })}
              />
              O sujeito consente com a coleta dos seus dados fisiológicos nesta sessão.
            </label>
            {current.consentAt && (
              <p className="muted-copy">Consentimento registrado em {formatDateTime(current.consentAt)}.</p>
            )}
            {!isReady && (
              <ul className="required-list">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            <p className="muted-copy">
              {profile
                ? "Salvo automaticamente neste navegador. O perfil é anexado à experiência (lifecycle e relatório) ao iniciar."
                : "O cadastro é salvo automaticamente neste navegador assim que você começa a preencher."}
            </p>
            <div className="form-actions">
              <button
                className="command-button danger"
                disabled={!profile}
                type="button"
                onClick={() => setIsConfirmingClear(true)}
              >
                <Trash2 aria-hidden size={15} /> Limpar cadastro
              </button>
              <button className="command-button strong" type="button" onClick={() => onNavigate("recording")}>
                Próximo: Gravação <ArrowRight aria-hidden size={15} />
              </button>
            </div>
          </div>
        </Panel>
      </section>

      {isConfirmingClear && (
        <Dialog
          eyebrow="Cadastro do sujeito"
          title="Limpar o cadastro?"
          onClose={() => setIsConfirmingClear(false)}
          actions={
            <>
              <button className="mini-button" type="button" onClick={() => setIsConfirmingClear(false)}>
                Cancelar
              </button>
              <button className="mini-button danger" type="button" onClick={clearProfile}>
                Limpar cadastro
              </button>
            </>
          }
        >
          <p>
            Os dados de <strong>{current.subjectId || "sujeito sem ID"}</strong> serão apagados deste navegador. Relatórios
            já exportados não são afetados. Esta ação não pode ser desfeita.
          </p>
        </Dialog>
      )}
    </>
  );
}
