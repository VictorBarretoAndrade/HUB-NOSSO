import { CheckCircle2, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import type { ParticipantSurveyRouteParams } from "../../app/navigation";
import { Panel } from "../../components/Panel";
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
import type { CsqVrItemDefinition, SurveyLanguage, Utaut2Placeholders } from "../../domain/surveyInstruments";
import {
  calculateCsqVrResult,
  calculateIpqResult,
  calculateSentimentResult,
  calculateSusResult,
  calculateUtaut2Result,
  loadSurveyRecords,
  saveSurveyRecords,
  upsertSurveyRecord,
} from "../../domain/surveys";
import type { CsqVrAnswers, SubjectSurveyRecord } from "../../domain/surveys";
import { browserStorage } from "../../lib/storage";

interface ParticipantSurveyPageProps {
  params: ParticipantSurveyRouteParams;
  onSubmitted?: (updated: SubjectSurveyRecord) => void;
}

export function ParticipantSurveyPage({ params, onSubmitted }: ParticipantSurveyPageProps) {
  const [lang, setLang] = useState<SurveyLanguage>(params.lang);
  const [submitted, setSubmitted] = useState(false);

  const [record] = useState<SubjectSurveyRecord>(() => {
    const all = loadSurveyRecords(browserStorage);
    const found = all.find((r) => r.id === params.recordId);
    if (found) return found;
    const now = new Date().toISOString();
    return {
      id: params.recordId || `subj-${Date.now()}`,
      subjectId: params.recordId || "Participante",
      systemName: "Ambiente Virtual (IVE)",
      createdAt: now,
      updatedAt: now,
    };
  });

  const meta = SURVEY_INSTRUMENT_META.find((m) => m.id === params.instrument) ?? SURVEY_INSTRUMENT_META[0];

  useEffect(() => {
    document.title = `${meta.shortLabel} · Questionário`;
  }, [meta.shortLabel]);

  // SUS state (sem preenchimento prévio enviesado — inicia neutro em 3 ou usa salvo)
  const [susAnswers, setSusAnswers] = useState<number[]>(() =>
    record.sus ? [...record.sus.answers] : SUS_ITEMS.map(() => 3),
  );

  // IPQ state
  const [ipqAnswers, setIpqAnswers] = useState<Record<string, number>>(() => {
    if (record.ipq) return { ...record.ipq.answers };
    const init: Record<string, number> = {};
    for (const item of IPQ_ITEMS) {
      init[item.id] = 3;
    }
    return init;
  });

  // CSQ-VR state
  const includeCsqPre = Boolean(params.csqPre);
  const [csqPost, setCsqPost] = useState<CsqVrAnswers>(() =>
    record.csqVr?.postAnswers ?? {
      nauseaA: 1,
      nauseaB: 1,
      vestibularA: 1,
      vestibularB: 1,
      oculomotorA: 1,
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

  // UTAUT2 state
  const utautPlaceholders: Utaut2Placeholders = {
    objective: params.objective || record.utaut2?.placeholders?.objective || DEFAULT_UTAUT2_PLACEHOLDERS[lang].objective,
    utility: params.utility || record.utaut2?.placeholders?.utility || DEFAULT_UTAUT2_PLACEHOLDERS[lang].utility,
    activities: params.activities || record.utaut2?.placeholders?.activities || DEFAULT_UTAUT2_PLACEHOLDERS[lang].activities,
    studiedActivity:
      params.studiedActivity ||
      record.utaut2?.placeholders?.studiedActivity ||
      DEFAULT_UTAUT2_PLACEHOLDERS[lang].studiedActivity,
  };
  const [utautAnswers, setUtautAnswers] = useState<Record<string, number>>(() => {
    if (record.utaut2) return { ...record.utaut2.answers };
    const init: Record<string, number> = {};
    for (const item of UTAUT2_ITEMS) {
      init[item.id] = 3;
    }
    return init;
  });

  // Sentiment state
  const [sentTexts, setSentTexts] = useState<Record<"feeling" | "engagement" | "distance", string>>(() => ({
    feeling: record.sentiment?.entries.find((e) => e.questionId === "feeling")?.text ?? "",
    engagement: record.sentiment?.entries.find((e) => e.questionId === "engagement")?.text ?? "",
    distance: record.sentiment?.entries.find((e) => e.questionId === "distance")?.text ?? "",
  }));
  const [sentLikert, setSentLikert] = useState(() =>
    record.sentiment?.likert ?? { presence: 3, bodyEngagement: 3, similarity: 3 },
  );

  const likert5Labels = LIKERT_5_LABELS[lang];
  const csq7Labels = CSQ_VR_7_LABELS[lang];

  const handleSubmit = () => {
    const now = new Date().toISOString();
    const currentAll = loadSurveyRecords(browserStorage);
    const latestRecord = currentAll.find((r) => r.id === record.id) ?? record;

    let updated: SubjectSurveyRecord = { ...latestRecord, updatedAt: now };

    if (params.instrument === "sus") {
      updated = { ...updated, sus: calculateSusResult(susAnswers, now) };
    } else if (params.instrument === "ipq") {
      updated = { ...updated, ipq: calculateIpqResult(ipqAnswers, now) };
    } else if (params.instrument === "csqVr") {
      updated = {
        ...updated,
        csqVr: calculateCsqVrResult(csqPost, includeCsqPre ? csqPre : latestRecord.csqVr?.preAnswers, now),
      };
    } else if (params.instrument === "utaut2") {
      updated = { ...updated, utaut2: calculateUtaut2Result(utautAnswers, utautPlaceholders, now) };
    } else if (params.instrument === "sentiment") {
      updated = {
        ...updated,
        sentiment: calculateSentimentResult({
          texts: sentTexts,
          likert: sentLikert,
          threshold: latestRecord.sentiment?.threshold ?? 0.05,
          manualOverrideScore: latestRecord.sentiment?.manualOverrideScore,
        }),
      };
    }

    const nextRecords = upsertSurveyRecord(currentAll, updated);
    saveSurveyRecords(browserStorage, nextRecords);
    onSubmitted?.(updated);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <main className="participant-survey-shell">
        <div className="participant-survey-container">
          <Panel title={meta.title[lang]}>
            <div className="participant-done-card">
              <CheckCircle2 aria-hidden size={48} className="participant-done-icon" />
              <h2>
                {lang === "pt"
                  ? "Respostas registradas com sucesso!"
                  : "Responses submitted successfully!"}
              </h2>
              <p className="muted-copy">
                {lang === "pt"
                  ? `Obrigado pela sua participação (${record.subjectId}). Os dados foram salvos automaticamente e você já pode fechar esta aba.`
                  : `Thank you for your participation (${record.subjectId}). Your responses have been saved and you may now close this tab.`}
              </p>
              <div className="form-actions" style={{ justifyContent: "center" }}>
                <button className="command-button strong" type="button" onClick={() => window.close()}>
                  {lang === "pt" ? "Fechar esta aba" : "Close this tab"}
                </button>
                <button className="command-button" type="button" onClick={() => setSubmitted(false)}>
                  {lang === "pt" ? "Revisar respostas" : "Review responses"}
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </main>
    );
  }

  return (
    <main className="participant-survey-shell">
      <div className="participant-survey-container">
        <header className="participant-survey-header">
          <div>
            <span className="eyebrow">
              {lang === "pt" ? "Formulário de Pesquisa" : "Research Questionnaire"} ·{" "}
              <span className="mono">{record.subjectId}</span>
            </span>
            <h1>{meta.title[lang]}</h1>
            <p className="muted-copy">
              {lang === "pt"
                ? `Experiência: ${record.systemName}. Leia cada afirmação com atenção e selecione a opção que melhor representa a sua percepção.`
                : `Experience: ${record.systemName}. Read each statement carefully and select the option that best reflects your perception.`}
            </p>
          </div>
          <button
            className="mini-button"
            type="button"
            onClick={() => setLang(lang === "pt" ? "en" : "pt")}
          >
            <Globe aria-hidden size={14} /> {lang === "pt" ? "PT-BR" : "EN"}
          </button>
        </header>

        <Panel title={meta.shortLabel}>
          {params.instrument === "sus" && (
            <div className="survey-questions-list">
              {SUS_ITEMS.map((item, idx) => (
                <div className="survey-question-card" key={item.id}>
                  <div className="survey-question-header">
                    <span className="mono">
                      <strong>{item.id}</strong>
                    </span>
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
          )}

          {params.instrument === "ipq" && (
            <div className="survey-questions-list">
              {IPQ_ITEMS.map((item) => (
                <div className="survey-question-card" key={item.id}>
                  <div className="survey-question-header">
                    <span className="mono">
                      <strong>
                        {lang === "pt" ? `Questão ${item.index}` : `Question ${item.index}`}
                      </strong>
                    </span>
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
          )}

          {params.instrument === "csqVr" && (
            <div className="survey-questions-list">
              {CSQ_VR_ITEMS.map((item: CsqVrItemDefinition) => (
                <div className="survey-question-card" key={item.id}>
                  <div className="survey-question-header">
                    <span className="mono">
                      <strong>{item.categoryLabel[lang]}</strong>
                    </span>
                  </div>
                  <p className="survey-question-prompt">{item.text[lang]}</p>

                  {includeCsqPre && (
                    <div className="csq-moment-block">
                      <span className="field-label">
                        {lang === "pt" ? "Antes da Experiência (1–7)" : "Before Experience (1–7)"}
                      </span>
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
                    <span className="field-label">
                      {lang === "pt" ? "Após a Experiência (1–7)" : "After Experience (1–7)"}
                    </span>
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
          )}

          {params.instrument === "utaut2" && (
            <div className="survey-questions-list">
              {UTAUT2_CONSTRUCTS.map((construct) => {
                const items = UTAUT2_ITEMS.filter((i) => i.construct === construct.id);
                return (
                  <div className="utaut-construct-section" key={construct.id}>
                    <div className="utaut-construct-header">
                      <h4>{construct.name[lang]}</h4>
                    </div>
                    <div className="survey-questions-list" style={{ marginTop: 10 }}>
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
                                  onClick={() => setUtautAnswers({ ...utautAnswers, [item.id]: val })}
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
            </div>
          )}

          {params.instrument === "sentiment" && (
            <div className="survey-analytics-stack">
              <div className="survey-questions-list">
                {SENTIMENT_INTERVIEW_QUESTIONS.map((q) => (
                  <div className="survey-question-card" key={q.id}>
                    <div className="survey-question-header">
                      <strong>{q.label[lang]}</strong>
                    </div>
                    <p className="survey-question-prompt">{q.prompt[lang]}</p>
                    <textarea
                      placeholder={
                        lang === "pt"
                          ? "Digite sua resposta aqui..."
                          : "Type your response here..."
                      }
                      value={sentTexts[q.id]}
                      onChange={(e) => setSentTexts({ ...sentTexts, [q.id]: e.target.value })}
                    />
                  </div>
                ))}
              </div>

              <div className="utaut-construct-section">
                <div className="utaut-construct-header">
                  <h4>
                    {lang === "pt" ? "Avaliação Geral da Experiência" : "Overall Experience Assessment"}
                  </h4>
                </div>
                <div className="survey-questions-list" style={{ marginTop: 10 }}>
                  {SENTIMENT_LIKERT_ITEMS.map((item) => (
                    <div className="survey-question-card" key={item.id}>
                      <div className="survey-question-header">
                        <strong>{item.label[lang]}</strong>
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
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 20 }}>
            <button className="command-button strong" type="button" onClick={handleSubmit}>
              <CheckCircle2 aria-hidden size={16} />{" "}
              {lang === "pt" ? "Enviar Respostas" : "Submit Responses"}
            </button>
          </div>
        </Panel>
      </div>
    </main>
  );
}
