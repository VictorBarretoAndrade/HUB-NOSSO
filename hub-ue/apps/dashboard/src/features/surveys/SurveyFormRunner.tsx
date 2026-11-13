import { CheckCircle2, Eye, EyeOff, Sparkles } from "lucide-react";
import { useState } from "react";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import {
  CSQ_VR_7_LABELS,
  CSQ_VR_ITEMS,
  DEFAULT_UTAUT2_PLACEHOLDERS,
  formatUtaut2ItemText,
  IPQ_ITEMS,
  LIKERT_5_LABELS,
  SENTIMENT_INTERVIEW_QUESTIONS,
  SENTIMENT_LIKERT_ITEMS,
  SURVEY_INSTRUMENT_META,
  SUS_ITEMS,
  UTAUT2_CONSTRUCTS,
  UTAUT2_ITEMS,
} from "../../domain/surveyInstruments";
import type {
  CsqVrItemDefinition,
  SurveyInstrumentId,
  SurveyLanguage,
  Utaut2Placeholders,
} from "../../domain/surveyInstruments";
import {
  calculateCsqVrResult,
  calculateIpqResult,
  calculateSentimentResult,
  calculateSusResult,
  calculateUtaut2Result,
} from "../../domain/surveys";
import type { CsqVrAnswers, SubjectSurveyRecord } from "../../domain/surveys";

interface SurveyFormRunnerProps {
  activeInstrument: SurveyInstrumentId;
  lang: SurveyLanguage;
  record: SubjectSurveyRecord;
  onInstrumentChange: (instrument: SurveyInstrumentId) => void;
  onSaveRecord: (updated: SubjectSurveyRecord, instrumentLabel: string) => void;
}

export function SurveyFormRunner({
  activeInstrument,
  lang,
  record,
  onInstrumentChange,
  onSaveRecord,
}: SurveyFormRunnerProps) {
  const [showLiveScore, setShowLiveScore] = useState<boolean>(false);

  // SUS local draft
  const [susAnswers, setSusAnswers] = useState<number[]>(() =>
    record.sus ? [...record.sus.answers] : SUS_ITEMS.map(() => 4),
  );

  // IPQ local draft
  const [ipqAnswers, setIpqAnswers] = useState<Record<string, number>>(() => {
    if (record.ipq) return { ...record.ipq.answers };
    const init: Record<string, number> = {};
    for (const item of IPQ_ITEMS) {
      init[item.id] = item.reversed ? 2 : 4;
    }
    return init;
  });

  // CSQ-VR local draft
  const [includeCsqPre, setIncludeCsqPre] = useState<boolean>(() => Boolean(record.csqVr?.preAnswers));
  const [csqPost, setCsqPost] = useState<CsqVrAnswers>(() =>
    record.csqVr?.postAnswers ?? {
      nauseaA: 1,
      nauseaB: 1,
      vestibularA: 1,
      vestibularB: 1,
      oculomotorA: 2,
      oculomotorB: 1,
    },
  );
  const [csqPre, setCsqPre] = useState<CsqVrAnswers>(() =>
    record.csqVr?.preAnswers ?? {
      nauseaA: 1,
      nauseaB: 1,
      vestibularA: 1,
      vestibularB: 1,
      oculomotorA: 1,
      oculomotorB: 1,
    },
  );

  // UTAUT2 local draft
  const [utautPlaceholders, setUtautPlaceholders] = useState<Utaut2Placeholders>(
    () => record.utaut2?.placeholders ?? DEFAULT_UTAUT2_PLACEHOLDERS[lang],
  );
  const [utautAnswers, setUtautAnswers] = useState<Record<string, number>>(() => {
    if (record.utaut2) return { ...record.utaut2.answers };
    const init: Record<string, number> = {};
    for (const item of UTAUT2_ITEMS) {
      init[item.id] = 4;
    }
    return init;
  });

  // Sentiment local draft
  const [sentTexts, setSentTexts] = useState<Record<"feeling" | "engagement" | "distance", string>>(() => ({
    feeling: record.sentiment?.entries.find((e) => e.questionId === "feeling")?.text ?? "",
    engagement: record.sentiment?.entries.find((e) => e.questionId === "engagement")?.text ?? "",
    distance: record.sentiment?.entries.find((e) => e.questionId === "distance")?.text ?? "",
  }));
  const [sentLikert, setSentLikert] = useState(() =>
    record.sentiment?.likert ?? { presence: 4, bodyEngagement: 4, similarity: 4 },
  );
  const [sentThreshold, setSentThreshold] = useState<number>(() => record.sentiment?.threshold ?? 0.05);
  const [sentManualOverride, setSentManualOverride] = useState<string>(() =>
    typeof record.sentiment?.manualOverrideScore === "number"
      ? String(record.sentiment.manualOverrideScore)
      : "",
  );

  // Live previews
  const liveSus = calculateSusResult(susAnswers);
  const liveIpq = calculateIpqResult(ipqAnswers);
  const liveCsq = calculateCsqVrResult(csqPost, includeCsqPre ? csqPre : undefined);
  const liveUtaut = calculateUtaut2Result(utautAnswers, utautPlaceholders);
  const parsedManualScore =
    sentManualOverride.trim() !== "" && Number.isFinite(Number(sentManualOverride))
      ? Number(sentManualOverride)
      : undefined;
  const liveSent = calculateSentimentResult({
    texts: sentTexts,
    likert: sentLikert,
    threshold: sentThreshold,
    manualOverrideScore: parsedManualScore,
  });

  const saveInstrument = () => {
    const now = new Date().toISOString();
    if (activeInstrument === "sus") {
      onSaveRecord(
        { ...record, updatedAt: now, sus: calculateSusResult(susAnswers, now) },
        "SUS",
      );
    } else if (activeInstrument === "ipq") {
      onSaveRecord(
        { ...record, updatedAt: now, ipq: calculateIpqResult(ipqAnswers, now) },
        "IPQ",
      );
    } else if (activeInstrument === "csqVr") {
      onSaveRecord(
        {
          ...record,
          updatedAt: now,
          csqVr: calculateCsqVrResult(csqPost, includeCsqPre ? csqPre : undefined, now),
        },
        "CSQ-VR",
      );
    } else if (activeInstrument === "utaut2") {
      onSaveRecord(
        {
          ...record,
          updatedAt: now,
          utaut2: calculateUtaut2Result(utautAnswers, utautPlaceholders, now),
        },
        "UTAUT2",
      );
    } else {
      onSaveRecord(
        {
          ...record,
          updatedAt: now,
          sentiment: calculateSentimentResult(
            {
              texts: sentTexts,
              likert: sentLikert,
              threshold: sentThreshold,
              manualOverrideScore: parsedManualScore,
            },
            now,
          ),
        },
        "Análise de Sentimento",
      );
    }
  };

  const likert5Labels = LIKERT_5_LABELS[lang];
  const csq7Labels = CSQ_VR_7_LABELS[lang];

  return (
    <div className="survey-analytics-stack">
      {/* Seletor rápido de instrumento com status de preenchimento do sujeito atual */}
      <div className="survey-toolbar-bar" style={{ marginBottom: 0, justifyContent: "space-between", alignItems: "center" }}>
        <span className="eyebrow" style={{ margin: 0 }}>Modo de Aplicação</span>
        <button
          className="mini-button"
          type="button"
          onClick={() => setShowLiveScore(!showLiveScore)}
          title="Alterna a exibição dos cálculos e pontuações em tempo real"
        >
          {showLiveScore ? <EyeOff aria-hidden size={14} /> : <Eye aria-hidden size={14} />}
          {showLiveScore ? "Ocultar escore em tempo real (Modo Sujeito)" : "Exibir escore em tempo real (Modo Debug)"}
        </button>
      </div>

      <div className="survey-instrument-cards">
        {SURVEY_INSTRUMENT_META.map((meta) => {
          const isCompleted = Boolean(record[meta.id]);
          const isActive = activeInstrument === meta.id;
          return (
            <button
              className={`survey-instrument-card ${isActive ? "active" : ""}`}
              key={meta.id}
              type="button"
              onClick={() => onInstrumentChange(meta.id)}
            >
              <div className="survey-instrument-card-top">
                <strong>{meta.shortLabel}</strong>
                {isCompleted && <StatusPill tone="ok" label="Registrado" />}
              </div>
              <p className="survey-instrument-card-title">{meta.title[lang]}</p>
              <span className="survey-instrument-card-meta">{meta.scaleLabel[lang]}</span>
            </button>
          );
        })}
      </div>

      {activeInstrument === "sus" && (
        <Panel
          title={`System Usability Scale (SUS) — Sujeito ${record.subjectId}`}
          action={
            showLiveScore ? (
              <StatusPill
                tone={liveSus.score >= 68 ? "ok" : liveSus.score >= 51.7 ? "warn" : "error"}
                label={`Escore em tempo real: ${liveSus.score.toFixed(1)} / 100 · Grade ${liveSus.grade} (${liveSus.adjective})`}
              />
            ) : undefined
          }
        >
          <p className="muted-copy">
            Itens ímpares têm formulação positiva (Pontuação = Resposta − 1) e itens
            pares têm formulação negativa (Pontuação = 5 − Resposta). A soma multiplicada
            por 2,5 gera o escore final de 0 a 100.
          </p>
          <div className="survey-questions-list">
            {SUS_ITEMS.map((item, idx) => (
              <div className="survey-question-card" key={item.id}>
                <div className="survey-question-header">
                  <span className="mono">
                    <strong>{item.id}</strong> {showLiveScore ? `(${item.positive ? "Positiva" : "Negativa"})` : ""}
                  </span>
                  {showLiveScore && (
                    <span className="mono muted-copy">
                      Contribuição: {liveSus.questionScores[idx].toFixed(1)} / 10
                    </span>
                  )}
                </div>
                <p className="survey-question-prompt">{item.text[lang]}</p>
                <div className="survey-likert-grid-5" role="radiogroup" aria-label={item.text[lang]}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      aria-checked={susAnswers[idx] === val}
                      className={`survey-likert-option ${susAnswers[idx] === val ? "selected" : ""}`}
                      key={val}
                      role="radio"
                      type="button"
                      onClick={() => {
                        const next = [...susAnswers];
                        next[idx] = val;
                        setSusAnswers(next);
                      }}
                    >
                      <strong>{val}</strong>
                      <span>{likert5Labels[val - 1]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button className="command-button strong" type="button" onClick={saveInstrument}>
              <CheckCircle2 aria-hidden size={16} /> Salvar SUS no Sujeito {record.subjectId}
            </button>
          </div>
        </Panel>
      )}

      {activeInstrument === "ipq" && (
        <Panel
          title={`Igroup Presence Questionnaire (IPQ) — Sujeito ${record.subjectId}`}
          action={
            showLiveScore ? (
              <StatusPill
                tone={liveIpq.globalPresence >= 3.5 ? "ok" : "warn"}
                label={`GP: ${liveIpq.globalPresence.toFixed(2)} (SP ${liveIpq.spatialPresence.toFixed(2)} · INV ${liveIpq.involvement.toFixed(2)} · REAL ${liveIpq.experiencedRealism.toFixed(2)})`}
              />
            ) : undefined
          }
        >
          <p className="muted-copy">
            Os itens SP2 (3), SP3 (4), INV1 (7) e INV3 (9) possuem formulação reversa e são invertidos automaticamente
            (Pontuação = 6 − Resposta) no cálculo das subescalas.
          </p>
          <div className="survey-questions-list">
            {IPQ_ITEMS.map((item) => (
              <div className="survey-question-card" key={item.id}>
                <div className="survey-question-header">
                  <span className="mono">
                    <strong>
                      Item {item.index} ({item.id})
                    </strong>{" "}
                    {showLiveScore ? `· Subescala ${item.subscale}` : ""}
                  </span>
                  {showLiveScore && item.reversed && <span className="mono muted-copy">Item invertido (6 − resposta)</span>}
                </div>
                <p className="survey-question-prompt">{item.text[lang]}</p>
                <div className="survey-likert-grid-5" role="radiogroup" aria-label={item.text[lang]}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button
                      aria-checked={ipqAnswers[item.id] === val}
                      className={`survey-likert-option ${ipqAnswers[item.id] === val ? "selected" : ""}`}
                      key={val}
                      role="radio"
                      type="button"
                      onClick={() => setIpqAnswers({ ...ipqAnswers, [item.id]: val })}
                    >
                      <strong>{val}</strong>
                      <span>{likert5Labels[val - 1]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button className="command-button strong" type="button" onClick={saveInstrument}>
              <CheckCircle2 aria-hidden size={16} /> Salvar IPQ no Sujeito {record.subjectId}
            </button>
          </div>
        </Panel>
      )}

      {activeInstrument === "csqVr" && (
        <Panel
          title={`Cybersickness in Virtual Reality (CSQ-VR) — Sujeito ${record.subjectId}`}
          action={
            showLiveScore ? (
              <StatusPill
                tone={liveCsq.post.total < 9 ? "ok" : liveCsq.post.total < 14 ? "warn" : "error"}
                label={`Total Pós-VR: ${liveCsq.post.total} / 42 (Náusea ${liveCsq.post.nausea} · Vestibular ${liveCsq.post.vestibular} · Oculomotor ${liveCsq.post.oculomotor})`}
              />
            ) : undefined
          }
        >
          <div className="survey-toolbar-bar">
            <label className="checkbox-line">
              <input
                checked={includeCsqPre}
                type="checkbox"
                onChange={(e) => setIncludeCsqPre(e.target.checked)}
              />
              Registrar também Baseline Pré-VR (Antes da exposição) para cálculo de Diferença (Δ Tabela 11)
            </label>
          </div>

          <div className="survey-questions-list">
            {CSQ_VR_ITEMS.map((item: CsqVrItemDefinition) => (
              <div className="survey-question-card" key={item.id}>
                <div className="survey-question-header">
                  <span className="mono">
                    <strong>{item.label}</strong> · {item.categoryLabel[lang]}
                  </span>
                </div>
                <p className="survey-question-prompt">{item.text[lang]}</p>

                {includeCsqPre && (
                  <div className="csq-moment-block">
                    <span className="field-label">Antes da Exposição (Pré-VR · Baseline 1–7)</span>
                    <div className="survey-likert-grid-7">
                      {[1, 2, 3, 4, 5, 6, 7].map((val) => (
                        <button
                          className={`survey-likert-option ${csqPre[item.id] === val ? "selected" : ""}`}
                          key={`pre-${val}`}
                          type="button"
                          onClick={() => setCsqPre({ ...csqPre, [item.id]: val })}
                        >
                          <strong>{val}</strong>
                          <span>{csq7Labels[val - 1].replace(/^\d\s·\s/, "")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="csq-moment-block">
                  <span className="field-label">Após a Exposição (Pós-VR · 1–7)</span>
                  <div className="survey-likert-grid-7">
                    {[1, 2, 3, 4, 5, 6, 7].map((val) => (
                      <button
                        className={`survey-likert-option ${csqPost[item.id] === val ? "selected" : ""}`}
                        key={`post-${val}`}
                        type="button"
                        onClick={() => setCsqPost({ ...csqPost, [item.id]: val })}
                      >
                        <strong>{val}</strong>
                        <span>{csq7Labels[val - 1].replace(/^\d\s·\s/, "")}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button className="command-button strong" type="button" onClick={saveInstrument}>
              <CheckCircle2 aria-hidden size={16} /> Salvar CSQ-VR no Sujeito {record.subjectId}
            </button>
          </div>
        </Panel>
      )}

      {activeInstrument === "utaut2" && (
        <Panel
          title={`UTAUT2 (Aceitação e Intenção de Uso) — Sujeito ${record.subjectId}`}
          action={
            showLiveScore ? (
              <StatusPill
                tone={liveUtaut.overallScore >= 3.8 ? "ok" : "warn"}
                label={`Média Geral: ${liveUtaut.overallScore.toFixed(2)} / 5.00 · BI: ${liveUtaut.constructs.BI.toFixed(2)}`}
              />
            ) : undefined
          }
        >
          <div className="utaut-placeholders-box">
            <strong>Adaptação Contextual dos Enunciados (Tabela 15 do Toolkit)</strong>
            <div className="utaut-placeholders-grid">
              <label>
                <span>Objetivo do ambiente [objective]</span>
                <input
                  value={utautPlaceholders.objective}
                  onChange={(e) =>
                    setUtautPlaceholders({ ...utautPlaceholders, objective: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Utilidade esperada [utility]</span>
                <input
                  value={utautPlaceholders.utility}
                  onChange={(e) =>
                    setUtautPlaceholders({ ...utautPlaceholders, utility: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Atividades associadas [activities]</span>
                <input
                  value={utautPlaceholders.activities}
                  onChange={(e) =>
                    setUtautPlaceholders({ ...utautPlaceholders, activities: e.target.value })
                  }
                />
              </label>
              <label>
                <span>Atividade estudada [studiedActivity]</span>
                <input
                  value={utautPlaceholders.studiedActivity}
                  onChange={(e) =>
                    setUtautPlaceholders({ ...utautPlaceholders, studiedActivity: e.target.value })
                  }
                />
              </label>
            </div>
          </div>

          {UTAUT2_CONSTRUCTS.map((construct) => {
            const items = UTAUT2_ITEMS.filter((i) => i.construct === construct.id);
            return (
              <div className="utaut-construct-section" key={construct.id}>
                <div className="utaut-construct-header">
                  <div>
                    <h4>{construct.name[lang]}</h4>
                    <p className="muted-copy">{construct.description[lang]}</p>
                  </div>
                  <span className="mono">
                    Escore Composto: <strong>{liveUtaut.constructs[construct.id].toFixed(2)}</strong> / 5.00
                  </span>
                </div>
                <div className="survey-questions-list">
                  {items.map((item) => {
                    const renderedText = formatUtaut2ItemText(item, lang, utautPlaceholders);
                    return (
                      <div className="survey-question-card" key={item.id}>
                        <div className="survey-question-header">
                          <span className="mono">
                            <strong>{item.id}</strong>
                          </span>
                        </div>
                        <p className="survey-question-prompt">{renderedText}</p>
                        <div className="survey-likert-grid-5">
                          {[1, 2, 3, 4, 5].map((val) => (
                            <button
                              className={`survey-likert-option ${utautAnswers[item.id] === val ? "selected" : ""}`}
                              key={val}
                              type="button"
                              onClick={() =>
                                setUtautAnswers({ ...utautAnswers, [item.id]: val })
                              }
                            >
                              <strong>{val}</strong>
                              <span>{likert5Labels[val - 1]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="form-actions">
            <button className="command-button strong" type="button" onClick={saveInstrument}>
              <CheckCircle2 aria-hidden size={16} /> Salvar UTAUT2 no Sujeito {record.subjectId}
            </button>
          </div>
        </Panel>
      )}

      {activeInstrument === "sentiment" && (
        <Panel
          title={`Análise de Sentimento Pós-Exposição — Sujeito ${record.subjectId}`}
          action={
            showLiveScore ? (
              <StatusPill
                tone={
                  liveSent.finalLabel === "positive"
                    ? "ok"
                    : liveSent.finalLabel === "negative"
                      ? "error"
                      : "warn"
                }
                label={`PC1: ${liveSent.avgSentimentPc1.toFixed(3)} · Polaridade: ${liveSent.finalLabel.toUpperCase()}`}
              />
            ) : undefined
          }
        >
          <p className="muted-copy">
            Protocolo baseado em Slater et al. (2023): coleta 3 relatos abertos pós-imersão + 3 escalas Likert
            reflexivas, calculando automaticamente os escores léxicos VADER + TextBlob e o indicador composto{" "}
            <code>sentiment_pc1</code>.
          </p>

          <div className="survey-questions-list">
            {SENTIMENT_INTERVIEW_QUESTIONS.map((q) => {
              const entry = liveSent.entries.find((e) => e.questionId === q.id);
              return (
                <div className="survey-question-card" key={q.id}>
                  <div className="survey-question-header">
                    <strong>{q.label[lang]}</strong>
                    {showLiveScore && entry && (
                      <span className="mono muted-copy">
                        VADER {entry.vaderScore.toFixed(2)} · TextBlob {entry.textblobScore.toFixed(2)} → PC1{" "}
                        <strong>{entry.compositePc1.toFixed(3)}</strong> ({entry.label})
                      </span>
                    )}
                  </div>
                  <p className="survey-question-prompt">{q.prompt[lang]}</p>
                  <textarea
                    placeholder="Transcreva ou digite a resposta espontânea do participante..."
                    value={sentTexts[q.id]}
                    onChange={(e) => setSentTexts({ ...sentTexts, [q.id]: e.target.value })}
                  />
                </div>
              );
            })}
          </div>

          <div className="utaut-construct-section">
            <div className="utaut-construct-header">
              <div>
                <h4>Avaliação Quantitativa Reflexiva (Likert 1–5 · Seção 6.1)</h4>
                <p className="muted-copy">
                  Utilizada para análise de correlação de Spearman (rho) e padrões de convergência/divergência.
                </p>
              </div>
            </div>
            <div className="survey-questions-list">
              {SENTIMENT_LIKERT_ITEMS.map((item) => (
                <div className="survey-question-card" key={item.id}>
                  <div className="survey-question-header">
                    <strong>{item.label[lang]}</strong>
                    {showLiveScore && (
                      <span className="mono muted-copy">
                        Padrão: {liveSent.patterns[item.id]}
                      </span>
                    )}
                  </div>
                  <p className="survey-question-prompt">{item.text[lang]}</p>
                  <div className="survey-likert-grid-5">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        className={`survey-likert-option ${sentLikert[item.id] === val ? "selected" : ""}`}
                        key={val}
                        type="button"
                        onClick={() => setSentLikert({ ...sentLikert, [item.id]: val })}
                      >
                        <strong>{val}</strong>
                        <span>{likert5Labels[val - 1]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="utaut-placeholders-box">
            <strong>
              <Sparkles aria-hidden size={14} /> Parâmetros de Classificação & Ajuste Manual (Opcional)
            </strong>
            <div className="utaut-placeholders-grid">
              <label>
                <span>Limiar de Neutralidade (Threshold, padrão 0.05)</span>
                <input
                  max={0.5}
                  min={0.01}
                  step={0.01}
                  type="number"
                  value={sentThreshold}
                  onChange={(e) => setSentThreshold(Number(e.target.value) || 0.05)}
                />
              </label>
              <label>
                <span>Sobrescrever avg_sentiment_pc1 manualmente (ex.: vindo do Colab Python)</span>
                <input
                  placeholder="Automático (deixe em branco)"
                  step={0.001}
                  type="number"
                  value={sentManualOverride}
                  onChange={(e) => setSentManualOverride(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="form-actions">
            <button className="command-button strong" type="button" onClick={saveInstrument}>
              <CheckCircle2 aria-hidden size={16} /> Salvar Análise de Sentimento no Sujeito {record.subjectId}
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}
