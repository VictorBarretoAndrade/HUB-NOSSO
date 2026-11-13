import {
  BarChart3,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderSync,
  Globe,
  HeartPulse,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatParticipantSurveyHash } from "../../app/navigation";
import type { Dashboard } from "../../app/useDashboard";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import { commandHistoryForRun, deriveExperienceReport } from "../../domain/experienceReport";
import { deriveAnalyticSessionTimeline, formatExperienceTime } from "../../domain/experienceRun";
import {
  computeCsqVrStudyAnalytics,
  computeIpqStudyAnalytics,
  computeSentimentStudyAnalytics,
  computeSusStudyAnalytics,
  computeUtaut2StudyAnalytics,
} from "../../domain/surveyAnalytics";
import {
  parseSurveyCsv,
  serializeCsqVrCsv,
  serializeIpqCsv,
  serializeSentimentCsv,
  serializeSusToolkitCsv,
  serializeUnifiedSurveyCsv,
  serializeUtaut2Csv,
} from "../../domain/surveyCsv";
import type { SurveyExportCsvKind } from "../../domain/surveyCsv";
import {
  DEFAULT_UTAUT2_PLACEHOLDERS,
  SURVEY_INSTRUMENT_META,
} from "../../domain/surveyInstruments";
import type {
  SurveyInstrumentId,
  SurveyLanguage,
  Utaut2Placeholders,
} from "../../domain/surveyInstruments";
import { deriveSurveySessionSummary } from "../../domain/surveys";
import type { SubjectSurveyRecord } from "../../domain/surveys";
import { downloadTextFile, fileTimestamp } from "../../lib/download";
import { formatBpmRange, formatReportMs } from "../../lib/format";
import {
  CsqVrAnalyticsPanel,
  IpqAnalyticsPanel,
  SentimentAnalyticsPanel,
  Utaut2AnalyticsPanel,
} from "./SelectIveCharts";
import { SurveyFormRunner } from "./SurveyFormRunner";
import { SusToolkitCharts } from "./SusToolkitCharts";

export type SurveysMainMode = "apply" | "analyze";
export type SurveysAnalyzeTab = "unified" | "analytics" | "csv";

interface SurveysViewProps {
  dashboard: Dashboard;
}

export function SurveysView({ dashboard }: SurveysViewProps) {
  const {
    commands,
    experienceEvents,
    lifecycle,
    notify,
    setup,
    surveyRecords,
    upsertSurvey,
    deleteSurvey,
    importSurveyRecords,
    loadSampleSurveys,
    clearAllSurveys,
  } = dashboard;

  const [mainMode, setMainMode] = useState<SurveysMainMode>("apply");
  const [analyzeTab, setAnalyzeTab] = useState<SurveysAnalyzeTab>("unified");
  const [activeInstrument, setActiveInstrument] = useState<SurveyInstrumentId>("sus");
  const [analyticsInstrument, setAnalyticsInstrument] = useState<SurveyInstrumentId>("sus");
  const [showInlineRunner, setShowInlineRunner] = useState<boolean>(false);
  const [launchCsqPre, setLaunchCsqPre] = useState<boolean>(false);
  const [lang, setLang] = useState<SurveyLanguage>("pt");
  const [launchPlaceholders, setLaunchPlaceholders] = useState<Utaut2Placeholders>(
    () => DEFAULT_UTAUT2_PLACEHOLDERS.pt,
  );
  const [selectedSystemFilter, setSelectedSystemFilter] = useState<string>("__ALL__");
  const [selectedRecordId, setSelectedRecordId] = useState<string>(
    () => surveyRecords[0]?.id ?? "",
  );
  const [newSubjectId, setNewSubjectId] = useState("");
  const [newSystemName, setNewSystemName] = useState("Ambiente Virtual (IVE)");
  const [csvPasteText, setCsvPasteText] = useState("");
  const [importReplaceMode, setImportReplaceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const run = lifecycle.run;
  const timeline = useMemo(
    () => deriveAnalyticSessionTimeline(experienceEvents, run, 200),
    [experienceEvents, run],
  );
  const reportCommandHistory = useMemo(
    () => commandHistoryForRun(run, commands.history),
    [commands.history, run],
  );
  const currentReport = useMemo(
    () => deriveExperienceReport(run, timeline, experienceEvents, reportCommandHistory),
    [experienceEvents, reportCommandHistory, run, timeline],
  );
  const currentSessionSummary = useMemo(
    () => deriveSurveySessionSummary(currentReport),
    [currentReport],
  );

  const activeSubjectId = setup.subject?.subjectId.trim() || "Sujeito-Sessao";

  // Garante um registro selecionado válido ou cria um rascunho vinculado à sessão atual
  const selectedRecord: SubjectSurveyRecord = useMemo(() => {
    const found = surveyRecords.find((r) => r.id === selectedRecordId) ?? surveyRecords[0];
    if (found) return found;
    const now = new Date().toISOString();
    return {
      id: `session-${run.runId ?? "draft"}`,
      subjectId: activeSubjectId,
      systemName: run.label || "Ambiente Virtual (IVE)",
      runId: run.runId,
      createdAt: now,
      updatedAt: now,
      subjectSnapshot: setup.subjectSnapshot,
      sessionSummary: currentSessionSummary,
    };
  }, [activeSubjectId, currentSessionSummary, run.label, run.runId, selectedRecordId, setup.subjectSnapshot, surveyRecords]);

  const distinctSystems = useMemo(
    () => Array.from(new Set(surveyRecords.map((r) => r.systemName).filter(Boolean))),
    [surveyRecords],
  );

  const filteredRecords = useMemo(
    () =>
      selectedSystemFilter === "__ALL__"
        ? surveyRecords
        : surveyRecords.filter((r) => r.systemName === selectedSystemFilter),
    [selectedSystemFilter, surveyRecords],
  );

  const susAnalytics = useMemo(
    () =>
      computeSusStudyAnalytics(
        filteredRecords,
        selectedSystemFilter === "__ALL__" ? "Todos os Sistemas / Sessões" : selectedSystemFilter,
      ),
    [filteredRecords, selectedSystemFilter],
  );
  const ipqAnalytics = useMemo(() => computeIpqStudyAnalytics(filteredRecords), [filteredRecords]);
  const csqAnalytics = useMemo(() => computeCsqVrStudyAnalytics(filteredRecords), [filteredRecords]);
  const utautAnalytics = useMemo(() => computeUtaut2StudyAnalytics(filteredRecords), [filteredRecords]);
  const sentimentAnalytics = useMemo(
    () => computeSentimentStudyAnalytics(filteredRecords),
    [filteredRecords],
  );

  const linkCurrentSession = (openApplyTab = false) => {
    const now = new Date().toISOString();
    const existing = surveyRecords.find(
      (r) =>
        (run.runId && r.runId === run.runId) ||
        (setup.subject?.subjectId && r.subjectId === setup.subject.subjectId),
    );
    const record: SubjectSurveyRecord = existing
      ? {
          ...existing,
          subjectId: activeSubjectId,
          runId: run.runId ?? existing.runId,
          systemName: run.label || existing.systemName || "Ambiente Virtual (IVE)",
          updatedAt: now,
          subjectSnapshot: setup.subjectSnapshot ?? existing.subjectSnapshot,
          sessionSummary:
            currentSessionSummary.sampleCount > 0 || currentSessionSummary.durationMs > 0
              ? currentSessionSummary
              : existing.sessionSummary,
        }
      : {
          id: `session-${run.runId ?? Date.now()}`,
          subjectId: activeSubjectId,
          systemName: run.label || newSystemName || "Ambiente Virtual (IVE)",
          runId: run.runId,
          createdAt: now,
          updatedAt: now,
          subjectSnapshot: setup.subjectSnapshot,
          sessionSummary: currentSessionSummary,
        };

    upsertSurvey(record);
    setSelectedRecordId(record.id);
    if (openApplyTab) {
      setMainMode("apply");
    }
    notify(`Sessão e dados biométricos vinculados ao sujeito ${record.subjectId}.`);
  };

  const handleOpenParticipantTab = (instrument: SurveyInstrumentId) => {
    const existsInStore = surveyRecords.some((r) => r.id === selectedRecord.id);
    if (!existsInStore) {
      upsertSurvey(selectedRecord);
    }
    const hash = formatParticipantSurveyHash({
      recordId: selectedRecord.id,
      instrument,
      lang,
      csqPre: instrument === "csqVr" && launchCsqPre ? true : undefined,
      objective: instrument === "utaut2" ? launchPlaceholders.objective : undefined,
      utility: instrument === "utaut2" ? launchPlaceholders.utility : undefined,
      activities: instrument === "utaut2" ? launchPlaceholders.activities : undefined,
      studiedActivity: instrument === "utaut2" ? launchPlaceholders.studiedActivity : undefined,
    });
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    const opened = window.open(url, "_blank");
    const meta = SURVEY_INSTRUMENT_META.find((m) => m.id === instrument);
    if (opened) {
      notify(`Formulário ${meta?.shortLabel ?? instrument} aberto em nova aba para ${selectedRecord.subjectId}.`);
    } else {
      window.location.hash = hash;
    }
  };

  const handleCreateSubjectRecord = () => {
    const cleanId = newSubjectId.trim() || `P${String(surveyRecords.length + 1).padStart(2, "0")}`;
    const now = new Date().toISOString();
    const record: SubjectSurveyRecord = {
      id: `subj-${cleanId}-${Date.now()}`,
      subjectId: cleanId,
      systemName: newSystemName.trim() || "Ambiente Virtual (IVE)",
      runId: run.runId,
      createdAt: now,
      updatedAt: now,
      subjectSnapshot: setup.subject?.subjectId === cleanId ? setup.subjectSnapshot : undefined,
      sessionSummary:
        currentSessionSummary.sampleCount > 0 || currentSessionSummary.durationMs > 0
          ? currentSessionSummary
          : undefined,
    };
    upsertSurvey(record);
    setSelectedRecordId(record.id);
    setNewSubjectId("");
    notify(`Sujeito ${cleanId} criado para aplicação dos formulários.`);
  };

  const handleSaveInstrument = (updated: SubjectSurveyRecord, instrumentLabel: string) => {
    upsertSurvey(updated);
    setSelectedRecordId(updated.id);
    notify(`Formulário ${instrumentLabel} salvo no registro de ${updated.subjectId}.`);
  };

  const handleExportCsv = (kind: SurveyExportCsvKind) => {
    const ts = fileTimestamp();
    if (kind === "sus-toolkit") {
      const content = serializeSusToolkitCsv(filteredRecords);
      downloadTextFile(`sus-analysis-toolkit-${ts}.csv`, content, "text/csv");
      notify("CSV exportado no formato do sus-analysis-toolkit (;).");
      return;
    }
    if (kind === "ipq") {
      downloadTextFile(`selective-ipq-${ts}.csv`, serializeIpqCsv(filteredRecords), "text/csv");
      notify("CSV do IPQ exportado.");
      return;
    }
    if (kind === "csq-vr") {
      downloadTextFile(`selective-csq-vr-${ts}.csv`, serializeCsqVrCsv(filteredRecords), "text/csv");
      notify("CSV do CSQ-VR exportado.");
      return;
    }
    if (kind === "utaut2") {
      downloadTextFile(`selective-utaut2-${ts}.csv`, serializeUtaut2Csv(filteredRecords), "text/csv");
      notify("CSV do UTAUT2 exportado.");
      return;
    }
    if (kind === "sentiment") {
      downloadTextFile(`selective-sentiment-${ts}.csv`, serializeSentimentCsv(filteredRecords), "text/csv");
      notify("CSV da Análise de Sentimento exportado.");
      return;
    }
    downloadTextFile(
      `biofeedback-unified-subject-sensors-surveys-${ts}.csv`,
      serializeUnifiedSurveyCsv(filteredRecords),
      "text/csv",
    );
    notify("CSV Unificado (Sujeito + Sensores + Formulários) exportado.");
  };

  const handleImportCsvText = (rawText: string) => {
    try {
      const result = parseSurveyCsv(rawText, newSystemName || "Ambiente Importado");
      if (result.importedCount === 0) {
        notify("Nenhum registro válido encontrado no CSV.", "error");
        return;
      }
      importSurveyRecords(result.records, importReplaceMode);
      if (result.records[0]) {
        setSelectedRecordId(result.records[0].id);
      }
      setCsvPasteText("");
      notify(
        `${result.importedCount} registros importados (${result.detectedFormat === "sus-toolkit" ? "formato SUS Toolkit" : "formato Unificado/SELECT-IVE"}).`,
      );
      setMainMode("analyze");
      setAnalyzeTab("analytics");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao processar CSV.", "error");
    }
  };

  const selectedInstrumentMeta =
    SURVEY_INSTRUMENT_META.find((m) => m.id === activeInstrument) ?? SURVEY_INSTRUMENT_META[0];

  return (
    <section className="content-grid surveys-layout">
      {/* Abas horizontais principais da área de Pesquisa */}
      <div className="survey-horizontal-tabs-bar">
        <div className="survey-horizontal-tabs" role="tablist" aria-label="Opções da aba de pesquisa">
          <button
            aria-selected={mainMode === "apply"}
            className={`survey-horizontal-tab ${mainMode === "apply" ? "active" : ""}`}
            role="tab"
            type="button"
            onClick={() => setMainMode("apply")}
          >
            <ClipboardCheck aria-hidden size={16} />
            <span>Aplicar Novo Formulário no Sujeito</span>
          </button>
          <button
            aria-selected={mainMode === "analyze"}
            className={`survey-horizontal-tab ${mainMode === "analyze" ? "active" : ""}`}
            role="tab"
            type="button"
            onClick={() => setMainMode("analyze")}
          >
            <BarChart3 aria-hidden size={16} />
            <span>Analisar Resultados</span>
            <span className="tab-count">{surveyRecords.length}</span>
          </button>
        </div>

        <div className="survey-header-actions" style={{ paddingBottom: 6 }}>
          <button
            className="mini-button"
            title="Alternar idioma dos enunciados dos formulários (PT-BR / EN)"
            type="button"
            onClick={() => setLang(lang === "pt" ? "en" : "pt")}
          >
            <Globe aria-hidden size={14} /> Idioma: {lang === "pt" ? "PT-BR" : "EN"}
          </button>
        </div>
      </div>

      {/* ===================================================================
          MODO 1: APLICAR NOVO FORMULÁRIO NO SUJEITO
          =================================================================== */}
      {mainMode === "apply" && (
        <div className="report-wide survey-analytics-stack">
          {/* Seção 1: Sujeito e Sessão em Foco */}
          <Panel
            title="1. Sujeito e Sessão em Foco"
            action={
              <button className="mini-button" type="button" onClick={() => linkCurrentSession(true)}>
                <FolderSync aria-hidden size={14} /> Sincronizar Sessão Atual ({activeSubjectId})
              </button>
            }
          >
            <div className="survey-session-banner">
              <div className="survey-session-banner-info">
                <span className="eyebrow">Vínculo com a Sessão & Sensores</span>
                <p>
                  <strong>Sujeito ativo:</strong> <span className="mono">{activeSubjectId}</span> ·{" "}
                  <strong>Run:</strong> <span className="mono">{run.runId ?? "não iniciada"}</span> ({run.status}) ·{" "}
                  <strong>Biometria capturada:</strong>{" "}
                  <span className="mono">
                    BPM {formatBpmRange(currentSessionSummary.bpmMin, currentSessionSummary.bpmAvg, currentSessionSummary.bpmMax)}
                  </span>{" "}
                  / <span className="mono">RR {formatReportMs(currentSessionSummary.rrAvgMs)}</span> (
                  {currentSessionSummary.sampleCount} amostras)
                </p>
              </div>
              <div className="survey-session-banner-buttons">
                <button className="mini-button" type="button" onClick={() => linkCurrentSession(false)}>
                  <UserCheck aria-hidden size={14} /> Atualizar Biometria
                </button>
              </div>
            </div>

            <div className="survey-toolbar-bar" style={{ marginBottom: 0 }}>
              <label>
                <span>Sujeito / Sessão em Foco</span>
                <select
                  value={selectedRecord.id}
                  onChange={(e) => setSelectedRecordId(e.target.value)}
                >
                  {surveyRecords.length === 0 ? (
                    <option value={selectedRecord.id}>
                      {selectedRecord.subjectId} (Sessão atual)
                    </option>
                  ) : (
                    surveyRecords.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.subjectId} · {r.systemName} {r.runId ? `(${r.runId})` : ""}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label>
                <span>Novo Sujeito ID</span>
                <input
                  placeholder="Ex.: S-2026-015"
                  value={newSubjectId}
                  onChange={(e) => setNewSubjectId(e.target.value)}
                />
              </label>
              <label>
                <span>Sistema / Ambiente (System)</span>
                <input
                  placeholder="Ex.: Treinamento NR-35"
                  value={newSystemName}
                  onChange={(e) => setNewSystemName(e.target.value)}
                />
              </label>
              <button className="mini-button strong" type="button" onClick={handleCreateSubjectRecord}>
                <Plus aria-hidden size={14} /> Adicionar Sujeito
              </button>
            </div>
          </Panel>

          {/* Seção 2: Seleção do Tipo de Formulário e Abertura em Nova Aba */}
          <Panel
            title={`2. Selecionar Tipo de Formulário — Sujeito ${selectedRecord.subjectId}`}
            action={
              <button
                className="mini-button"
                type="button"
                onClick={() => setShowInlineRunner((prev) => !prev)}
              >
                {showInlineRunner ? "Ocultar Edição Inline" : "Editar / Depurar nesta tela (Operador)"}
              </button>
            }
          >
            <div className="survey-instrument-cards">
              {SURVEY_INSTRUMENT_META.map((meta) => {
                const isCompleted = Boolean(selectedRecord[meta.id]);
                const isActive = activeInstrument === meta.id;
                return (
                  <button
                    className={`survey-instrument-card ${isActive ? "active" : ""}`}
                    key={meta.id}
                    type="button"
                    onClick={() => setActiveInstrument(meta.id)}
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

            {activeInstrument === "csqVr" && (
              <div className="survey-toolbar-bar" style={{ marginTop: 12 }}>
                <label className="checkbox-line">
                  <input
                    checked={launchCsqPre}
                    type="checkbox"
                    onChange={(e) => setLaunchCsqPre(e.target.checked)}
                  />
                  Incluir Baseline Pré-VR (Antes da exposição) no formulário do sujeito
                </label>
              </div>
            )}

            {activeInstrument === "utaut2" && (
              <div className="utaut-placeholders-box">
                <strong>Adaptação Contextual dos Enunciados (UTAUT2)</strong>
                <div className="utaut-placeholders-grid">
                  <label>
                    <span>Objetivo [objective]</span>
                    <input
                      value={launchPlaceholders.objective}
                      onChange={(e) =>
                        setLaunchPlaceholders({ ...launchPlaceholders, objective: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Utilidade [utility]</span>
                    <input
                      value={launchPlaceholders.utility}
                      onChange={(e) =>
                        setLaunchPlaceholders({ ...launchPlaceholders, utility: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Atividades [activities]</span>
                    <input
                      value={launchPlaceholders.activities}
                      onChange={(e) =>
                        setLaunchPlaceholders({ ...launchPlaceholders, activities: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Atividade estudada [studiedActivity]</span>
                    <input
                      value={launchPlaceholders.studiedActivity}
                      onChange={(e) =>
                        setLaunchPlaceholders({ ...launchPlaceholders, studiedActivity: e.target.value })
                      }
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button
                className="command-button strong"
                type="button"
                onClick={() => handleOpenParticipantTab(activeInstrument)}
              >
                <ExternalLink aria-hidden size={16} /> Abrir {selectedInstrumentMeta.shortLabel} em Nova Aba (Visão do Sujeito)
              </button>
            </div>
          </Panel>

          {showInlineRunner && (
            <SurveyFormRunner
              activeInstrument={activeInstrument}
              key={selectedRecord.id}
              lang={lang}
              record={selectedRecord}
              onInstrumentChange={setActiveInstrument}
              onSaveRecord={handleSaveInstrument}
            />
          )}
        </div>
      )}

      {/* ===================================================================
          MODO 2: ANALISAR OS RESULTADOS
          =================================================================== */}
      {mainMode === "analyze" && (
        <>
          {/* Seção de Gerenciamento de Amostra / Sujeito em Foco / Filtro */}
          <Panel
            className="report-wide"
            title="Sujeito em Foco e Banco de Dados da Pesquisa"
            action={
              <div className="survey-session-banner-buttons">
                <button
                  className="mini-button"
                  type="button"
                  onClick={() => {
                    loadSampleSurveys();
                    notify("Estudo demonstrativo SELECT-IVE (14 sujeitos com sensores + 5 formulários) carregado.");
                  }}
                >
                  <Sparkles aria-hidden size={14} /> Carregar Estudo Exemplo (N=14)
                </button>
                {surveyRecords.length > 0 && (
                  <button
                    className="mini-button danger"
                    title="Limpa os registros mockados/demonstrativos para operar com sujeitos e sessões reais"
                    type="button"
                    onClick={() => {
                      if (window.confirm("Deseja limpar todos os registros de pesquisa salvos e iniciar um banco limpo para testes reais?")) {
                        clearAllSurveys();
                        notify("Registros removidos. Banco de formulários limpo para coleta real.");
                      }
                    }}
                  >
                    <Trash2 aria-hidden size={14} /> Limpar Dados
                  </button>
                )}
              </div>
            }
          >
            <div className="survey-main-tabs" role="tablist" aria-label="Seções de análise">
              <button
                aria-selected={analyzeTab === "unified"}
                className={`survey-nav-btn ${analyzeTab === "unified" ? "active" : ""}`}
                role="tab"
                type="button"
                onClick={() => setAnalyzeTab("unified")}
              >
                <HeartPulse aria-hidden size={16} />
                <span>Dossiê Unificado (Sensores + Pesquisa)</span>
                <span className="tab-count">{surveyRecords.length}</span>
              </button>
              <button
                aria-selected={analyzeTab === "analytics"}
                className={`survey-nav-btn ${analyzeTab === "analytics" ? "active" : ""}`}
                role="tab"
                type="button"
                onClick={() => setAnalyzeTab("analytics")}
              >
                <BarChart3 aria-hidden size={16} />
                <span>Análise Gráfica (SUS Toolkit & SELECT-IVE)</span>
              </button>
              <button
                aria-selected={analyzeTab === "csv"}
                className={`survey-nav-btn ${analyzeTab === "csv" ? "active" : ""}`}
                role="tab"
                type="button"
                onClick={() => setAnalyzeTab("csv")}
              >
                <FileSpreadsheet aria-hidden size={16} />
                <span>Importar / Exportar CSV</span>
              </button>
            </div>

            <div className="survey-toolbar-bar" style={{ marginBottom: 0 }}>
              <label>
                <span>Sujeito / Sessão em Foco</span>
                <select
                  value={selectedRecord.id}
                  onChange={(e) => setSelectedRecordId(e.target.value)}
                >
                  {surveyRecords.length === 0 ? (
                    <option value={selectedRecord.id}>
                      {selectedRecord.subjectId} (Sessão atual)
                    </option>
                  ) : (
                    surveyRecords.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.subjectId} · {r.systemName} {r.runId ? `(${r.runId})` : ""}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label>
                <span>Filtrar por Sistema (System)</span>
                <select
                  value={selectedSystemFilter}
                  onChange={(e) => setSelectedSystemFilter(e.target.value)}
                >
                  <option value="__ALL__">Todos os Sistemas ({surveyRecords.length} sujeitos)</option>
                  {distinctSystems.map((sys) => (
                    <option key={sys} value={sys}>
                      {sys}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Panel>

          {/* SUB-ABA 1: DOSSIÊ UNIFICADO (SUJEITO + SENSORES + PESQUISA) */}
          {analyzeTab === "unified" && (
        <div className="report-wide survey-analytics-stack">
          <div className="survey-charts-grid-2">
            <Panel
              title={`Dossiê Fisiológico & Sensores — ${selectedRecord.subjectId}`}
              action={
                <StatusPill
                  tone={selectedRecord.sessionSummary?.sampleCount ? "ok" : "muted"}
                  label={
                    selectedRecord.sessionSummary?.sampleCount
                      ? `${selectedRecord.sessionSummary.sampleCount} amostras biométricas`
                      : "Sem amostras na sessão"
                  }
                />
              }
            >
              <div className="survey-dossier-grid">
                <div className="survey-dossier-stat">
                  <span>Subject ID</span>
                  <strong className="mono">{selectedRecord.subjectId}</strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>Run / Sessão</span>
                  <strong className="mono">{selectedRecord.runId ?? "Manual / Importado"}</strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>BPM Mín / Méd / Máx</span>
                  <strong className="mono">
                    {formatBpmRange(
                      selectedRecord.sessionSummary?.bpmMin,
                      selectedRecord.sessionSummary?.bpmAvg,
                      selectedRecord.sessionSummary?.bpmMax,
                    )}
                  </strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>RR Médio / IBI</span>
                  <strong className="mono">
                    {formatReportMs(selectedRecord.sessionSummary?.rrAvgMs)} (
                    {selectedRecord.sessionSummary?.ibiSampleCount ?? 0} IBI)
                  </strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>Duração / Markers</span>
                  <strong className="mono">
                    {formatExperienceTime(selectedRecord.sessionSummary?.durationMs ?? 0)} ·{" "}
                    {selectedRecord.sessionSummary?.markerCount ?? 0} markers
                  </strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>Demografia & HRV</span>
                  <strong>
                    {selectedRecord.subjectSnapshot?.demographics.ageYears
                      ? `${selectedRecord.subjectSnapshot.demographics.ageYears} anos`
                      : "Idade n/d"}{" "}
                    · Sono {selectedRecord.subjectSnapshot?.confounders.sleepHours ?? "--"}h · Estresse{" "}
                    {selectedRecord.subjectSnapshot?.confounders.stressLevel ?? "--"}
                  </strong>
                </div>
              </div>
            </Panel>

            <Panel
              title={`Dossiê Psicométrico (SELECT-IVE) — ${selectedRecord.subjectId}`}
              action={
                <button
                  className="mini-button strong"
                  type="button"
                  onClick={() => setMainMode("apply")}
                >
                  <ClipboardCheck aria-hidden size={14} /> Aplicar / Editar Formulários
                </button>
              }
            >
              <div className="survey-dossier-grid">
                <div className="survey-dossier-stat">
                  <span>SUS (Usabilidade 0–100)</span>
                  <strong>
                    {selectedRecord.sus
                      ? `${selectedRecord.sus.score.toFixed(1)} · Grade ${selectedRecord.sus.grade} (${selectedRecord.sus.adjective})`
                      : "Não aplicado"}
                  </strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>IPQ (Presença 1–5)</span>
                  <strong>
                    {selectedRecord.ipq
                      ? `GP ${selectedRecord.ipq.globalPresence.toFixed(2)} (SP ${selectedRecord.ipq.spatialPresence.toFixed(2)} · INV ${selectedRecord.ipq.involvement.toFixed(2)} · REAL ${selectedRecord.ipq.experiencedRealism.toFixed(2)})`
                      : "Não aplicado"}
                  </strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>CSQ-VR (Cybersickness 6–42)</span>
                  <strong>
                    {selectedRecord.csqVr
                      ? `Total ${selectedRecord.csqVr.post.total} (N:${selectedRecord.csqVr.post.nausea} V:${selectedRecord.csqVr.post.vestibular} O:${selectedRecord.csqVr.post.oculomotor})`
                      : "Não aplicado"}
                  </strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>UTAUT2 (Aceitação 1–5)</span>
                  <strong>
                    {selectedRecord.utaut2
                      ? `Média ${selectedRecord.utaut2.overallScore.toFixed(2)} · Intenção (BI) ${selectedRecord.utaut2.constructs.BI.toFixed(2)}`
                      : "Não aplicado"}
                  </strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>Sentimento Pós-Exposição (PC1)</span>
                  <strong>
                    {selectedRecord.sentiment
                      ? `${selectedRecord.sentiment.avgSentimentPc1.toFixed(3)} (${selectedRecord.sentiment.finalLabel.toUpperCase()})`
                      : "Não aplicado"}
                  </strong>
                </div>
                <div className="survey-dossier-stat">
                  <span>Sistema / Ambiente</span>
                  <strong>{selectedRecord.systemName}</strong>
                </div>
              </div>
            </Panel>
          </div>

          <Panel
            title="Tabela Consolidada: Sujeitos, Sensores da Sessão e Formulários de Pesquisa"
            action={
              <div className="survey-header-actions">
                <button
                  className="mini-button strong"
                  disabled={surveyRecords.length === 0}
                  type="button"
                  onClick={() => handleExportCsv("unified")}
                >
                  <Download aria-hidden size={14} /> Exportar CSV Unificado
                </button>
                <button
                  className="mini-button"
                  disabled={surveyRecords.length === 0}
                  type="button"
                  onClick={() => handleExportCsv("sus-toolkit")}
                >
                  <Download aria-hidden size={14} /> Exportar SUS Toolkit CSV
                </button>
              </div>
            }
          >
            {surveyRecords.length === 0 ? (
              <p className="empty-state">
                Nenhum sujeito registrado ainda. Clique em <strong>Aplicar Formulário na Sessão Atual</strong> ou{" "}
                <strong>Carregar Estudo Exemplo (N=14)</strong> acima para começar.
              </p>
            ) : (
              <div className="table-scroll">
                <table className="data-table report-table">
                  <thead>
                    <tr>
                      <th>Sujeito</th>
                      <th>Run / Sessão</th>
                      <th>Sistema</th>
                      <th>BPM Mín/Méd/Máx</th>
                      <th>RR Médio</th>
                      <th>SUS (0–100)</th>
                      <th>IPQ GP (1–5)</th>
                      <th>CSQ-VR (6–42)</th>
                      <th>UTAUT2 BI</th>
                      <th>Sentimento PC1</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surveyRecords.map((rec) => {
                      const isSelected = rec.id === selectedRecord.id;
                      return (
                        <tr
                          className={isSelected ? "selected-row" : undefined}
                          key={rec.id}
                          onClick={() => setSelectedRecordId(rec.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <td className="mono">
                            <strong>{rec.subjectId}</strong>
                          </td>
                          <td className="mono">{rec.runId ?? "--"}</td>
                          <td>{rec.systemName}</td>
                          <td className="mono">
                            {formatBpmRange(
                              rec.sessionSummary?.bpmMin,
                              rec.sessionSummary?.bpmAvg,
                              rec.sessionSummary?.bpmMax,
                            )}
                          </td>
                          <td className="mono">{formatReportMs(rec.sessionSummary?.rrAvgMs)}</td>
                          <td className="mono">
                            {rec.sus ? (
                              <strong>
                                {rec.sus.score.toFixed(1)} ({rec.sus.grade})
                              </strong>
                            ) : (
                              "--"
                            )}
                          </td>
                          <td className="mono">{rec.ipq ? rec.ipq.globalPresence.toFixed(2) : "--"}</td>
                          <td className="mono">{rec.csqVr ? rec.csqVr.post.total : "--"}</td>
                          <td className="mono">
                            {rec.utaut2 ? rec.utaut2.constructs.BI.toFixed(2) : "--"}
                          </td>
                          <td className="mono">
                            {rec.sentiment
                              ? `${rec.sentiment.avgSentimentPc1.toFixed(2)} (${rec.sentiment.finalLabel})`
                              : "--"}
                          </td>
                          <td>
                            <div className="survey-row-actions">
                              <button
                                className="mini-button"
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecordId(rec.id);
                                  setMainMode("apply");
                                }}
                              >
                                Formulários
                              </button>
                              <button
                                aria-label={`Remover ${rec.subjectId}`}
                                className="mini-button danger"
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSurvey(rec.id);
                                  notify(`Registro de ${rec.subjectId} removido.`);
                                }}
                              >
                                <Trash2 aria-hidden size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* SUB-ABA 2: ANÁLISE GRÁFICA (SUS TOOLKIT & SELECT-IVE) */}
      {analyzeTab === "analytics" && (
        <div className="report-wide survey-analytics-stack">
          <Panel title="Seleção de Instrumento & Filtro de Sistema">
            <div className="survey-toolbar-bar">
              <div className="preset-chip-row" role="tablist" aria-label="Instrumentos para análise gráfica">
                <button
                  className={`preset-chip ${analyticsInstrument === "sus" ? "active" : ""}`}
                  type="button"
                  onClick={() => setAnalyticsInstrument("sus")}
                >
                  SUS Analysis Toolkit ({susAnalytics.sampleSize})
                </button>
                <button
                  className={`preset-chip ${analyticsInstrument === "ipq" ? "active" : ""}`}
                  type="button"
                  onClick={() => setAnalyticsInstrument("ipq")}
                >
                  IPQ Presença ({ipqAnalytics.sampleSize})
                </button>
                <button
                  className={`preset-chip ${analyticsInstrument === "csqVr" ? "active" : ""}`}
                  type="button"
                  onClick={() => setAnalyticsInstrument("csqVr")}
                >
                  CSQ-VR Cybersickness ({csqAnalytics.sampleSize})
                </button>
                <button
                  className={`preset-chip ${analyticsInstrument === "utaut2" ? "active" : ""}`}
                  type="button"
                  onClick={() => setAnalyticsInstrument("utaut2")}
                >
                  UTAUT2 Aceitação & Alpha ({utautAnalytics.sampleSize})
                </button>
                <button
                  className={`preset-chip ${analyticsInstrument === "sentiment" ? "active" : ""}`}
                  type="button"
                  onClick={() => setAnalyticsInstrument("sentiment")}
                >
                  Sentimento & Triangulação Sensores ({sentimentAnalytics.sampleSize})
                </button>
              </div>

              <label>
                <span>Filtrar por Sistema (System)</span>
                <select
                  value={selectedSystemFilter}
                  onChange={(e) => setSelectedSystemFilter(e.target.value)}
                >
                  <option value="__ALL__">Todos os Sistemas ({surveyRecords.length} sujeitos)</option>
                  {distinctSystems.map((sys) => (
                    <option key={sys} value={sys}>
                      {sys}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Panel>

          {analyticsInstrument === "sus" && <SusToolkitCharts analytics={susAnalytics} lang={lang} />}
          {analyticsInstrument === "ipq" && <IpqAnalyticsPanel analytics={ipqAnalytics} lang={lang} />}
          {analyticsInstrument === "csqVr" && <CsqVrAnalyticsPanel analytics={csqAnalytics} />}
          {analyticsInstrument === "utaut2" && (
            <Utaut2AnalyticsPanel analytics={utautAnalytics} lang={lang} />
          )}
          {analyticsInstrument === "sentiment" && (
            <SentimentAnalyticsPanel
              analytics={sentimentAnalytics}
              lang={lang}
              records={filteredRecords}
            />
          )}
        </div>
      )}

      {/* SUB-ABA 3: IMPORTAR / EXPORTAR CSV */}
      {analyzeTab === "csv" && (
        <div className="report-wide survey-charts-grid-2">
          <Panel title="Importar CSV (SUS Analysis Toolkit ou SELECT-IVE Unificado)">
            <p className="muted-copy">
              Compatível com arquivos CSV do <strong>sus-analysis-toolkit</strong> (<code>Question 1;...;Question 10;System</code>)
              e com planilhas CSV unificadas ou de qualquer instrumento (SUS, IPQ, CSQ-VR, UTAUT2, Sentiment Analysis).
            </p>
            <div className="form-block">
              <label className="checkbox-line">
                <input
                  checked={importReplaceMode}
                  type="checkbox"
                  onChange={(e) => setImportReplaceMode(e.target.checked)}
                />
                Substituir registros atuais ao importar (desmarcado = mesclar/adicionar aos atuais)
              </label>

              <input
                accept=".csv,text/csv"
                ref={fileInputRef}
                style={{ display: "none" }}
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string") {
                      handleImportCsvText(reader.result);
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = "";
                }}
              />

              <div className="form-actions">
                <button
                  className="command-button strong"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload aria-hidden size={16} /> Selecionar Arquivo .CSV
                </button>
              </div>

              <label htmlFor="csv-paste-area">Ou cole o conteúdo CSV abaixo:</label>
              <textarea
                id="csv-paste-area"
                placeholder="Question 1;Question 2;Question 3;Question 4;Question 5;Question 6;Question 7;Question 8;Question 9;Question 10;System&#10;5;1;5;1;4;2;5;1;5;2;System A"
                rows={6}
                value={csvPasteText}
                onChange={(e) => setCsvPasteText(e.target.value)}
              />
              <div className="form-actions">
                <button
                  className="command-button"
                  disabled={!csvPasteText.trim()}
                  type="button"
                  onClick={() => handleImportCsvText(csvPasteText)}
                >
                  <Upload aria-hidden size={16} /> Importar CSV Colado
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="Exportar Dados (CSV & JSON)">
            <p className="muted-copy">
              Exporte os resultados individuais e de sensores de forma unificada ou no formato específico de cada
              ferramenta.
            </p>
            <div className="survey-export-grid">
              <button
                className="command-button strong"
                disabled={filteredRecords.length === 0}
                type="button"
                onClick={() => handleExportCsv("unified")}
              >
                <Download aria-hidden size={16} /> CSV Unificado (Sujeito + Sensores + 5 Formulários)
              </button>
              <button
                className="command-button"
                disabled={susAnalytics.sampleSize === 0}
                type="button"
                onClick={() => handleExportCsv("sus-toolkit")}
              >
                <Download aria-hidden size={16} /> CSV formato sus-analysis-toolkit (;)
              </button>
              <button
                className="command-button"
                disabled={ipqAnalytics.sampleSize === 0}
                type="button"
                onClick={() => handleExportCsv("ipq")}
              >
                <Download aria-hidden size={16} /> CSV IPQ (Itens + Subescalas SP/INV/REAL/GP)
              </button>
              <button
                className="command-button"
                disabled={csqAnalytics.sampleSize === 0}
                type="button"
                onClick={() => handleExportCsv("csq-vr")}
              >
                <Download aria-hidden size={16} /> CSV CSQ-VR (Pré/Pós + Náusea/Vestibular/Oculomotor)
              </button>
              <button
                className="command-button"
                disabled={utautAnalytics.sampleSize === 0}
                type="button"
                onClick={() => handleExportCsv("utaut2")}
              >
                <Download aria-hidden size={16} /> CSV UTAUT2 (27 Itens + 8 Construtos)
              </button>
              <button
                className="command-button"
                disabled={sentimentAnalytics.sampleSize === 0}
                type="button"
                onClick={() => handleExportCsv("sentiment")}
              >
                <Download aria-hidden size={16} /> CSV Análise de Sentimento (VADER + TextBlob + PC1)
              </button>
              <button
                className="command-button danger"
                disabled={surveyRecords.length === 0}
                type="button"
                onClick={() => {
                  clearAllSurveys();
                  notify("Todos os registros de pesquisa foram removidos deste navegador.");
                }}
              >
                <Trash2 aria-hidden size={16} /> Limpar Todos os Registros ({surveyRecords.length})
              </button>
            </div>
          </Panel>
        </div>
      )}
        </>
      )}
    </section>
  );
}
