import { useState } from "react";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import {
  getSusPercentileCurvePoints,
  SUS_CONCLUSIVENESS_CURVE,
} from "../../domain/surveyAnalytics";
import type { SusQuestionAnalytics, SusStudyAnalytics } from "../../domain/surveyAnalytics";
import { LIKERT_5_LABELS, SUS_ITEMS } from "../../domain/surveyInstruments";
import type { SurveyLanguage } from "../../domain/surveyInstruments";

export type SusToolkitPreset = "all" | "preset_1" | "preset_2" | "preset_3" | "preset_4";
export type SusScaleOption =
  | "all_three"
  | "adjectiveScale"
  | "gradeScale"
  | "acceptabilityScale"
  | "quartileScale"
  | "promoterScale"
  | "industryBenchmarkScale";

interface SusToolkitChartsProps {
  analytics: SusStudyAnalytics;
  lang: SurveyLanguage;
}

const LIKERT_MEANING_COLORS = ["#8FD14F", "#CEE741", "#FEF445", "#FAC710", "#F24726"];

interface ScaleSegment {
  label: string;
  min: number;
  max: number;
  color: string;
  textColor?: string;
}

const ADJECTIVE_SEGMENTS: ScaleSegment[] = [
  { label: "Worst", min: 0, max: 25, color: "#F24726" },
  { label: "Poor", min: 25, max: 51.7, color: "#FAC710" },
  { label: "OK", min: 51.7, max: 71.0, color: "#FEF445" },
  { label: "Good", min: 71.0, max: 80.7, color: "#CEE741" },
  { label: "Excellent", min: 80.7, max: 84.0, color: "#8FD14F" },
  { label: "Best", min: 84.0, max: 100, color: "#008000", textColor: "#ffffff" },
];

const GRADE_SEGMENTS: ScaleSegment[] = [
  { label: "F", min: 0, max: 51.6, color: "#F24726" },
  { label: "D", min: 51.6, max: 62.6, color: "#FAC710" },
  { label: "C", min: 62.6, max: 72.5, color: "#FEF445" },
  { label: "B", min: 72.5, max: 78.8, color: "#CEE741" },
  { label: "A", min: 78.8, max: 100, color: "#8FD14F" },
];

const ACCEPTABILITY_SEGMENTS: ScaleSegment[] = [
  { label: "Not Acceptable", min: 0, max: 51.6, color: "#F24726" },
  { label: "Marginal", min: 51.6, max: 72.5, color: "#FEF445" },
  { label: "Acceptable", min: 72.5, max: 100, color: "#8FD14F" },
];

const QUARTILE_SEGMENTS: ScaleSegment[] = [
  { label: "1st Q", min: 0, max: 62.5, color: "#F24726" },
  { label: "2nd Q", min: 62.5, max: 71.0, color: "#FAC710" },
  { label: "3rd Q", min: 71.0, max: 78.0, color: "#FEF445" },
  { label: "4th Q", min: 78.0, max: 100, color: "#CEE741" },
];

const PROMOTER_SEGMENTS: ScaleSegment[] = [
  { label: "Detractor", min: 0, max: 62.5, color: "#F24726" },
  { label: "Passive", min: 62.5, max: 78.8, color: "#FEF445" },
  { label: "Promoter", min: 78.8, max: 100, color: "#8FD14F" },
];

const BENCHMARK_SEGMENTS: ScaleSegment[] = [
  { label: "Below Avg (<68)", min: 0, max: 68, color: "#F24726" },
  { label: "Above Avg", min: 68, max: 80, color: "#FEF445" },
  { label: "Benchmark (>80)", min: 80, max: 100, color: "#8FD14F" },
];

export function SusToolkitCharts({ analytics, lang }: SusToolkitChartsProps) {
  const [preset, setPreset] = useState<SusToolkitPreset>("all");
  const [scaleOption, setScaleOption] = useState<SusScaleOption>("all_three");
  const [colorizeMode, setColorizeMode] = useState<"byMeaning" | "regular">("byMeaning");
  const [perItemView, setPerItemView] = useState<"likert" | "radar" | "bars">("likert");

  if (analytics.sampleSize === 0) {
    return (
      <Panel title="SUS Analysis Toolkit">
        <p className="empty-state">
          Nenhum formulário SUS registrado ainda. Aplique um questionário SUS ou importe um CSV para visualizar os
          gráficos do SUS Analysis Toolkit.
        </p>
      </Panel>
    );
  }

  const showPercentile = preset === "all" || preset === "preset_3" || preset === "preset_4";
  const showConclusiveness = preset === "all" || preset === "preset_1" || preset === "preset_2" || preset === "preset_4";
  const showRadar = preset === "all" || preset === "preset_1";
  const showLikert = preset === "all" || preset === "preset_2" || preset === "preset_3";

  return (
    <div className="survey-analytics-stack">
      <Panel
        title="SUS Analysis Toolkit · Painel Estatístico e Gráfico"
        action={
          <StatusPill
            tone={analytics.stats.mean >= 68 ? "ok" : analytics.stats.mean >= 51.7 ? "warn" : "error"}
            label={`SUS ${analytics.stats.mean.toFixed(2)} · Grade ${analytics.grade} · ${analytics.adjective}`}
          />
        }
      >
        <div className="survey-toolbar-bar">
          <label>
            <span>Preset (Single Study)</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value as SusToolkitPreset)}>
              <option value="all">Suite Completa (Todos os gráficos)</option>
              <option value="preset_1">Preset 1: Boxplot + Conclusiveness + Radar</option>
              <option value="preset_2">Preset 2: Boxplot + Conclusiveness + Likert Stack</option>
              <option value="preset_3">Preset 3: Boxplot + Percentile + Likert Stack</option>
              <option value="preset_4">Preset 4: Boxplot + Percentile + Conclusiveness</option>
            </select>
          </label>
          <label>
            <span>Escala Contextual</span>
            <select value={scaleOption} onChange={(e) => setScaleOption(e.target.value as SusScaleOption)}>
              <option value="all_three">Adjective + Grade + Acceptability (Padrão Toolkit)</option>
              <option value="adjectiveScale">Adjective Scale (Bangor et al. 2009)</option>
              <option value="gradeScale">Grade Scale A–F (Sauro & Lewis 2016)</option>
              <option value="acceptabilityScale">Acceptability Scale (Bangor et al. 2008)</option>
              <option value="quartileScale">Quartile Scale (1st–4th)</option>
              <option value="promoterScale">NPS Promoter Scale (Sauro 2012)</option>
              <option value="industryBenchmarkScale">Industry Benchmark (68 / 80)</option>
            </select>
          </label>
          <label>
            <span>Cores Likert</span>
            <select
              value={colorizeMode}
              onChange={(e) => setColorizeMode(e.target.value as "byMeaning" | "regular")}
            >
              <option value="byMeaning">Por significado (Verde = favorável à usabilidade)</option>
              <option value="regular">Por valor numérico bruto (1 a 5)</option>
            </select>
          </label>
        </div>

        {/* Tabela de Estatísticas Descritivas igual ao parseDataForTable do sus-analysis-toolkit */}
        <div className="table-scroll">
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>Sistema / Estudo</th>
                <th>N</th>
                <th>Min</th>
                <th>1st Quartile</th>
                <th>Median</th>
                <th>SUS Score (Mean)</th>
                <th>SD (Sample)</th>
                <th>3rd Quartile</th>
                <th>Max</th>
                <th>Percentile</th>
                <th>Adjective</th>
                <th>Grade</th>
                <th>Acceptability</th>
                <th>NPS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{analytics.systemName}</strong>
                </td>
                <td className="mono">{analytics.sampleSize}</td>
                <td className="mono">{analytics.stats.min.toFixed(1)}</td>
                <td className="mono">{analytics.stats.q1.toFixed(1)}</td>
                <td className="mono">{analytics.stats.median.toFixed(1)}</td>
                <td className="mono">
                  <span className="sus-score-highlight">{analytics.stats.mean.toFixed(2)}</span>
                </td>
                <td className="mono">{analytics.stats.sd.toFixed(2)}</td>
                <td className="mono">{analytics.stats.q3.toFixed(1)}</td>
                <td className="mono">{analytics.stats.max.toFixed(1)}</td>
                <td className="mono">{analytics.percentile.toFixed(1)}%</td>
                <td>{analytics.adjective}</td>
                <td className="mono">
                  <strong>{analytics.grade}</strong>
                </td>
                <td>{analytics.acceptability}</td>
                <td>{analytics.nps}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="survey-charts-grid-2">
        <Panel
          title="SUS Score · Boxplot & Escalas de Contextualização"
          action={<span className="mono muted-copy">Média {analytics.stats.mean.toFixed(2)} ± {analytics.stats.sd.toFixed(2)}</span>}
        >
          <SusBoxPlotWithScales analytics={analytics} scaleOption={scaleOption} />
        </Panel>

        <div className="survey-charts-col-stack">
          {showPercentile && (
            <Panel
              title="Percentile Curve (Sauro & Lewis, 2016)"
              action={<span className="mono muted-copy">Percentil {analytics.percentile.toFixed(1)}%</span>}
            >
              <SusPercentileChart analytics={analytics} />
            </Panel>
          )}

          {showConclusiveness && (
            <Panel
              title="Conclusiveness Chart (Tullis & Stetson, 2006)"
              action={
                <StatusPill
                  tone={analytics.conclusivenessPercentage >= 80 ? "ok" : "warn"}
                  label={`N=${analytics.sampleSize} · ${analytics.conclusivenessPercentage}% conclusivo`}
                />
              }
            >
              <SusConclusivenessChart analytics={analytics} />
            </Panel>
          )}
        </div>
      </div>

      {(showLikert || showRadar) && (
        <Panel
          title="Per-Item Chart · Contribuição por Questão (Q1–Q10)"
          action={
            <div className="preset-chip-row">
              <button
                className={`preset-chip ${perItemView === "likert" ? "active" : ""}`}
                type="button"
                onClick={() => setPerItemView("likert")}
              >
                Distribuição Likert (%)
              </button>
              <button
                className={`preset-chip ${perItemView === "radar" ? "active" : ""}`}
                type="button"
                onClick={() => setPerItemView("radar")}
              >
                Radar Polar (0–10)
              </button>
              <button
                className={`preset-chip ${perItemView === "bars" ? "active" : ""}`}
                type="button"
                onClick={() => setPerItemView("bars")}
              >
                Barras Média ± DP (0–10)
              </button>
            </div>
          }
        >
          {perItemView === "likert" && (
            <SusLikertStackedChart
              colorizeMode={colorizeMode}
              lang={lang}
              questions={analytics.perQuestion}
            />
          )}
          {perItemView === "radar" && <SusRadarChart questions={analytics.perQuestion} />}
          {perItemView === "bars" && <SusPerQuestionBarChart lang={lang} questions={analytics.perQuestion} />}
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Boxplot + Contextualization Scales (Figure 2 of Toolkit)
// ---------------------------------------------------------------------------

function SusBoxPlotWithScales({
  analytics,
  scaleOption,
}: {
  analytics: SusStudyAnalytics;
  scaleOption: SusScaleOption;
}) {
  const width = 580;
  const height = 390;
  const padTop = 24;
  const padBottom = 36;
  const plotH = height - padTop - padBottom;

  const yForScore = (score: number) =>
    padTop + plotH - (Math.max(0, Math.min(100, score)) / 100) * plotH;

  const { min, q1, median, q3, max, mean, sd } = analytics.stats;
  const boxX = 115;
  const boxW = 84;
  const centerX = boxX + boxW / 2;

  const scaleColumns: Array<{ title: string; segments: ScaleSegment[] }> =
    scaleOption === "all_three"
      ? [
          { title: "Adjective", segments: ADJECTIVE_SEGMENTS },
          { title: "Grade", segments: GRADE_SEGMENTS },
          { title: "Acceptability", segments: ACCEPTABILITY_SEGMENTS },
        ]
      : scaleOption === "adjectiveScale"
        ? [{ title: "Adjective Scale", segments: ADJECTIVE_SEGMENTS }]
        : scaleOption === "gradeScale"
          ? [{ title: "Grade Scale", segments: GRADE_SEGMENTS }]
          : scaleOption === "acceptabilityScale"
            ? [{ title: "Acceptability Scale", segments: ACCEPTABILITY_SEGMENTS }]
            : scaleOption === "quartileScale"
              ? [{ title: "Quartile Scale", segments: QUARTILE_SEGMENTS }]
              : scaleOption === "promoterScale"
                ? [{ title: "NPS Promoter", segments: PROMOTER_SEGMENTS }]
                : [{ title: "Industry Benchmark", segments: BENCHMARK_SEGMENTS }];

  const scaleStartX = 275;
  const totalScaleW = width - scaleStartX - 18;
  const colW = totalScaleW / scaleColumns.length;

  return (
    <svg
      aria-label="SUS Score Boxplot e Escalas"
      className="survey-svg-chart"
      viewBox={`0 0 ${width} ${height}`}
    >
      <rect className="chart-frame" height={plotH} rx={6} width={220} x={44} y={padTop} />
      {[0, 20, 40, 60, 68, 80, 100].map((tick) => {
        const y = yForScore(tick);
        const isBenchmark = tick === 68;
        return (
          <g key={tick}>
            <line
              stroke={isBenchmark ? "#2f6db0" : "rgba(27,35,51,0.1)"}
              strokeDasharray={isBenchmark ? "4 4" : undefined}
              strokeWidth={isBenchmark ? 1.5 : 1}
              x1={44}
              x2={width - 18}
              y1={y}
              y2={y}
            />
            <text
              className="chart-axis-label"
               dominantBaseline="middle"
              textAnchor="end"
              x={38}
              y={y}
            >
              {tick}
            </text>
          </g>
        );
      })}

      {/* Whisker line Min to Max */}
      <line
        stroke="#1b2333"
        strokeWidth={2}
        x1={centerX}
        x2={centerX}
        y1={yForScore(max)}
        y2={yForScore(min)}
      />
      <line stroke="#1b2333" strokeWidth={2} x1={centerX - 22} x2={centerX + 22} y1={yForScore(max)} y2={yForScore(max)} />
      <line stroke="#1b2333" strokeWidth={2} x1={centerX - 22} x2={centerX + 22} y1={yForScore(min)} y2={yForScore(min)} />

      {/* IQR Box Q1 to Q3 */}
      <rect
        fill="rgba(47, 109, 176, 0.25)"
        height={Math.max(4, yForScore(q1) - yForScore(q3))}
        rx={3}
        stroke="#2f4d80"
        strokeWidth={2}
        width={boxW}
        x={boxX}
        y={yForScore(q3)}
      />

      {/* Median line */}
      <line
        stroke="#1b2333"
        strokeWidth={3}
        x1={boxX}
        x2={boxX + boxW}
        y1={yForScore(median)}
        y2={yForScore(median)}
      />

      {/* Mean ± SD dashed diamond */}
      <polygon
        fill="none"
        points={`${centerX},${yForScore(Math.min(100, mean + sd))} ${boxX + boxW - 6},${yForScore(mean)} ${centerX},${yForScore(Math.max(0, mean - sd))} ${boxX + 6},${yForScore(mean)}`}
        stroke="#177a45"
        strokeDasharray="3 3"
        strokeWidth={1.8}
      />
      <line
        stroke="#177a45"
        strokeDasharray="4 3"
        strokeWidth={2}
        x1={boxX - 10}
        x2={boxX + boxW + 10}
        y1={yForScore(mean)}
        y2={yForScore(mean)}
      />

      {/* Individual participant scores (jittered) */}
      {analytics.scores.map((s, idx) => {
        const jitter = ((idx % 5) - 2) * 7;
        return (
          <circle
            cx={68 + jitter}
            cy={yForScore(s)}
            fill="#2f4d80"
            key={`${idx}-${s}`}
            opacity={0.78}
            r={4}
            stroke="#ffffff"
            strokeWidth={1}
          >
            <title>{`Participante #${idx + 1}: SUS ${s.toFixed(1)}`}</title>
          </circle>
        );
      })}

      {/* Mean score callout badge */}
      <g transform={`translate(${boxX + boxW + 8}, ${yForScore(mean) - 10})`}>
        <rect fill="#177a45" height={20} rx={4} width={52} x={0} y={0} />
        <text fill="#ffffff" fontSize={10} fontWeight={700} textAnchor="middle" x={26} y={13}>
          {mean.toFixed(1)}
        </text>
      </g>

      {/* Vertical Scale Columns */}
      {scaleColumns.map((col, colIdx) => {
        const x = scaleStartX + colIdx * colW + 4;
        const w = colW - 8;
        return (
          <g key={col.title}>
            <text
              fill="#616b7e"
              fontSize={10}
              fontWeight={700}
              textAnchor="middle"
              x={x + w / 2}
              y={15}
            >
              {col.title}
            </text>
            {col.segments.map((seg) => {
              const yTop = yForScore(seg.max);
              const yBot = yForScore(seg.min);
              const segH = Math.max(2, yBot - yTop);
              return (
                <g key={seg.label}>
                  <rect
                    fill={seg.color}
                    height={segH}
                    stroke="#ffffff"
                    strokeWidth={1}
                    width={w}
                    x={x}
                    y={yTop}
                  />
                  {segH >= 14 && (
                    <text
                      dominantBaseline="middle"
                      fill={seg.textColor ?? "#1b2333"}
                      fontSize={10}
                      fontWeight={700}
                      textAnchor="middle"
                      x={x + w / 2}
                      y={yTop + segH / 2}
                    >
                      {seg.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      <text fill="#616b7e" fontSize={11} fontWeight={600} textAnchor="middle" x={154} y={height - 10}>
        System Usability Scale Study Score (0–100)
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 2. Percentile Curve (Figure 3 of Toolkit)
// ---------------------------------------------------------------------------

function SusPercentileChart({ analytics }: { analytics: SusStudyAnalytics }) {
  const width = 500;
  const height = 185;
  const padL = 44;
  const padR = 20;
  const padT = 16;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xFor = (score: number) => padL + (score / 100) * plotW;
  const yFor = (pct: number) => padT + plotH - (pct / 100) * plotH;

  const curve = getSusPercentileCurvePoints(80);
  const pathD = curve
    .map((pt, i) => `${i === 0 ? "M" : "L"}${xFor(pt.score).toFixed(1)},${yFor(pt.percentile).toFixed(1)}`)
    .join(" ");

  const studyX = xFor(analytics.stats.mean);
  const studyY = yFor(analytics.percentile);

  return (
    <svg aria-label="SUS Percentile Curve" className="survey-svg-chart" viewBox={`0 0 ${width} ${height}`}>
      <rect className="chart-frame" height={plotH} rx={6} width={plotW} x={padL} y={padT} />
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line
            className="chart-grid-line"
            x1={padL}
            x2={padL + plotW}
            y1={yFor(tick)}
            y2={yFor(tick)}
          />
          <text className="chart-axis-label" dominantBaseline="middle" textAnchor="end" x={padL - 6} y={yFor(tick)}>
            {tick}%
          </text>
        </g>
      ))}
      {[0, 20, 40, 60, 68, 80, 100].map((tick) => (
        <text
          className="chart-axis-label"
          key={tick}
          textAnchor="middle"
          x={xFor(tick)}
          y={padT + plotH + 14}
        >
          {tick}
        </text>
      ))}

      <path d={pathD} fill="none" stroke="#2f6db0" strokeWidth={2.5} />

      {/* Crosshair for current study */}
      <line
        stroke="#c0362b"
        strokeDasharray="3 3"
        strokeWidth={1.3}
        x1={studyX}
        x2={studyX}
        y1={studyY}
        y2={padT + plotH}
      />
      <line
        stroke="#c0362b"
        strokeDasharray="3 3"
        strokeWidth={1.3}
        x1={padL}
        x2={studyX}
        y1={studyY}
        y2={studyY}
      />
      <circle cx={studyX} cy={studyY} fill="#c0362b" r={6} stroke="#ffffff" strokeWidth={2} />
      <text
        fill="#c0362b"
        fontSize={11}
        fontWeight={700}
        textAnchor={studyX > width - 120 ? "end" : "start"}
        x={studyX > width - 120 ? studyX - 10 : studyX + 10}
        y={Math.max(padT + 14, studyY - 8)}
      >
        {`SUS ${analytics.stats.mean.toFixed(1)} → ${analytics.percentile.toFixed(0)}º percentil`}
      </text>
      <text fill="#616b7e" fontSize={10} fontWeight={600} textAnchor="middle" x={padL + plotW / 2} y={height - 4}>
        SUS Study Score (0–100)
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 3. Conclusiveness Chart (Figure 5 of Toolkit)
// ---------------------------------------------------------------------------

function SusConclusivenessChart({ analytics }: { analytics: SusStudyAnalytics }) {
  const width = 500;
  const height = 175;
  const padL = 44;
  const padR = 20;
  const padT = 16;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xFor = (n: number) => padL + ((Math.max(4, Math.min(15, n)) - 4) / 11) * plotW;
  const yFor = (pct: number) => padT + plotH - (pct / 100) * plotH;

  const pathD = SUS_CONCLUSIVENESS_CURVE.map(
    (pt, i) => `${i === 0 ? "M" : "L"}${xFor(pt.n).toFixed(1)},${yFor(pt.percentage).toFixed(1)}`,
  ).join(" ");

  const clampedN = Math.min(14, Math.max(4, analytics.sampleSize));
  const studyX = xFor(clampedN);
  const studyY = yFor(analytics.conclusivenessPercentage);

  return (
    <svg aria-label="SUS Conclusiveness Chart" className="survey-svg-chart" viewBox={`0 0 ${width} ${height}`}>
      <rect className="chart-frame" height={plotH} rx={6} width={plotW} x={padL} y={padT} />
      {[0, 35, 75, 100].map((tick) => (
        <g key={tick}>
          <line className="chart-grid-line" x1={padL} x2={padL + plotW} y1={yFor(tick)} y2={yFor(tick)} />
          <text className="chart-axis-label" dominantBaseline="middle" textAnchor="end" x={padL - 6} y={yFor(tick)}>
            {tick}%
          </text>
        </g>
      ))}
      {[6, 8, 10, 12, 14].map((n) => (
        <text className="chart-axis-label" key={n} textAnchor="middle" x={xFor(n)} y={padT + plotH + 14}>
          {n === 14 ? "14+" : n}
        </text>
      ))}

      <path d={pathD} fill="none" stroke="#2f4d80" strokeWidth={2.5} />
      {SUS_CONCLUSIVENESS_CURVE.map((pt) => (
        <circle cx={xFor(pt.n)} cy={yFor(pt.percentage)} fill="#2f4d80" key={pt.n} r={3.5} />
      ))}

      <circle cx={studyX} cy={studyY} fill="#177a45" r={6} stroke="#ffffff" strokeWidth={2} />
      <text
        fill="#177a45"
        fontSize={11}
        fontWeight={700}
        textAnchor={studyX > width - 130 ? "end" : "start"}
        x={studyX > width - 130 ? studyX - 10 : studyX + 10}
        y={Math.max(padT + 14, studyY - 8)}
      >
        {`N=${analytics.sampleSize} (${analytics.conclusivenessPercentage}%)`}
      </text>
      <text fill="#616b7e" fontSize={10} fontWeight={600} textAnchor="middle" x={padL + plotW / 2} y={height - 4}>
        Número de Participantes (Sample Size)
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 4. Per-Item Stacked Likert Bar Chart (Figure 4a of Toolkit)
// ---------------------------------------------------------------------------

function SusLikertStackedChart({
  questions,
  colorizeMode,
  lang,
}: {
  questions: SusQuestionAnalytics[];
  colorizeMode: "byMeaning" | "regular";
  lang: SurveyLanguage;
}) {
  const labels = LIKERT_5_LABELS[lang];

  return (
    <div className="sus-likert-stack">
      <div className="sus-likert-legend">
        {labels.map((label, idx) => (
          <span className="sus-likert-legend-item" key={label}>
            <i
              style={{
                background:
                  colorizeMode === "regular"
                    ? LIKERT_MEANING_COLORS[4 - idx]
                    : LIKERT_MEANING_COLORS[4 - idx],
              }}
            />
            <strong>{idx + 1}:</strong> {label}
          </span>
        ))}
        <span className="muted-copy">
          {colorizeMode === "byMeaning"
            ? "Nota: Nos itens pares (negativos), verde indica Discordância (favorável à usabilidade), igual ao sus-analysis-toolkit."
            : "Cores fixas pelo valor bruto da escala (1 a 5)."}
        </span>
      </div>

      <div className="sus-likert-rows">
        {questions.map((q, idx) => {
          const itemDef = SUS_ITEMS[idx];
          return (
            <div className="sus-likert-row" key={q.id}>
              <div className="sus-likert-question">
                <span className="mono">
                  <strong>Question {q.index}</strong> ({q.positive ? "+" : "−"})
                </span>
                <p>{itemDef.text[lang]}</p>
              </div>
              <div className="sus-likert-bar-track">
                {q.rawPercentages.map((pct, catIdx) => {
                  if (pct <= 0) return null;
                  const bgColor =
                    q.positive || colorizeMode === "regular"
                      ? LIKERT_MEANING_COLORS[4 - catIdx]
                      : LIKERT_MEANING_COLORS[catIdx];
                  return (
                    <div
                      className="sus-likert-segment"
                      key={catIdx}
                      style={{ width: `${pct}%`, background: bgColor }}
                      title={`${labels[catIdx]}: ${pct.toFixed(1)}% (${q.rawCounts[catIdx]} resp.)`}
                    >
                      {pct >= 9 ? `${Math.round(pct)}%` : ""}
                    </div>
                  );
                })}
              </div>
              <div className="sus-likert-score mono" title="Escore ajustado médio (0 a 10)">
                <strong>{q.meanScore.toFixed(1)}</strong>/10
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Per-Item Radar Chart & Bar Chart (Figure 4b of Toolkit)
// ---------------------------------------------------------------------------

function SusRadarChart({ questions }: { questions: SusQuestionAnalytics[] }) {
  const size = 340;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 118;
  const n = questions.length;

  const pointFor = (idx: number, value: number) => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const r = (Math.max(0, Math.min(10, value)) / 10) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const polygonPoints = questions
    .map((q, idx) => {
      const pt = pointFor(idx, q.meanScore);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="survey-radar-wrapper">
      <svg aria-label="SUS Per-Question Radar" className="survey-radar-svg" viewBox={`0 0 ${size} ${size}`}>
        {[2, 4, 6, 8, 10].map((ring) => (
          <circle
            cx={cx}
            cy={cy}
            fill="none"
            key={ring}
            r={(ring / 10) * radius}
            stroke="rgba(27,35,51,0.12)"
            strokeDasharray={ring === 10 ? undefined : "3 3"}
          />
        ))}
        {questions.map((q, idx) => {
          const outer = pointFor(idx, 10);
          const labelPt = pointFor(idx, 11.7);
          const valPt = pointFor(idx, q.meanScore);
          return (
            <g key={q.id}>
              <line stroke="rgba(27,35,51,0.12)" x1={cx} x2={outer.x} y1={cy} y2={outer.y} />
              <text
                dominantBaseline="middle"
                fill="#1b2333"
                fontSize={11}
                fontWeight={700}
                textAnchor="middle"
                x={labelPt.x}
                y={labelPt.y}
              >
                {`Q${q.index} (${q.meanScore.toFixed(1)})`}
              </text>
              <circle cx={valPt.x} cy={valPt.y} fill="#2f4d80" r={4} stroke="#ffffff" strokeWidth={1.5} />
            </g>
          );
        })}
        <polygon
          fill="rgba(47, 109, 176, 0.25)"
          points={polygonPoints}
          stroke="#2f4d80"
          strokeWidth={2.2}
        />
      </svg>
    </div>
  );
}

function SusPerQuestionBarChart({
  questions,
  lang,
}: {
  questions: SusQuestionAnalytics[];
  lang: SurveyLanguage;
}) {
  return (
    <div className="sus-likert-rows">
      {questions.map((q, idx) => {
        const pct = (q.meanScore / 10) * 100;
        return (
          <div className="sus-likert-row" key={q.id}>
            <div className="sus-likert-question">
              <span className="mono">
                <strong>Question {q.index}</strong>
              </span>
              <p>{SUS_ITEMS[idx].text[lang]}</p>
            </div>
            <div className="sus-bar-single-track">
              <div
                className="sus-bar-single-fill"
                style={{
                  width: `${pct}%`,
                  background: q.meanScore >= 7 ? "#177a45" : q.meanScore >= 5 ? "#2f6db0" : "#c2362a",
                }}
              />
            </div>
            <div className="sus-likert-score mono">
              <strong>{q.meanScore.toFixed(2)}</strong> ± {q.sdScore.toFixed(2)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
