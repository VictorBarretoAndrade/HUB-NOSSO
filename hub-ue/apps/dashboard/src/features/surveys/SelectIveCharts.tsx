import { useState } from "react";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type {
  CsqVrStudyAnalytics,
  IpqStudyAnalytics,
  SentimentStudyAnalytics,
  Utaut2StudyAnalytics,
} from "../../domain/surveyAnalytics";
import {
  IPQ_ITEMS,
  LIKERT_5_LABELS,
  UTAUT2_CONSTRUCTS,
} from "../../domain/surveyInstruments";
import type { SurveyLanguage } from "../../domain/surveyInstruments";
import type { SubjectSurveyRecord } from "../../domain/surveys";

// ---------------------------------------------------------------------------
// IPQ Charts (Section 3 of SELECT-IVE Toolkit: Presence Profile + Radar/Bars)
// ---------------------------------------------------------------------------

export function IpqAnalyticsPanel({
  analytics,
  lang,
}: {
  analytics: IpqStudyAnalytics;
  lang: SurveyLanguage;
}) {
  if (analytics.sampleSize === 0) {
    return (
      <Panel title="Igroup Presence Questionnaire (IPQ)">
        <p className="empty-state">
          Nenhum formulário IPQ registrado ainda. Aplique o IPQ ou importe um CSV para visualizar o perfil de presença.
        </p>
      </Panel>
    );
  }

  const sp = analytics.spatialPresence.mean;
  const inv = analytics.involvement.mean;
  const real = analytics.experiencedRealism.mean;
  const gp = analytics.globalPresence.mean;

  return (
    <div className="survey-analytics-stack">
      <Panel
        title="IPQ · Igroup Presence Questionnaire (Schubert et al., 2001)"
        action={
          <StatusPill
            tone={gp >= 3.5 ? "ok" : gp >= 2.8 ? "warn" : "error"}
            label={`Presença Global ${gp.toFixed(2)} / 5.00 (N=${analytics.sampleSize})`}
          />
        }
      >
        <div className="table-scroll">
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>Subescala / Dimensão</th>
                <th>Sigla</th>
                <th>Média (1–5)</th>
                <th>DP (SD)</th>
                <th>Mín</th>
                <th>Mediana</th>
                <th>Máx</th>
                <th>Interpretação</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Presença Espacial</strong> (Spatial Presence)
                </td>
                <td className="mono">SP</td>
                <td className="mono">
                  <strong>{sp.toFixed(2)}</strong>
                </td>
                <td className="mono">{analytics.spatialPresence.sd.toFixed(2)}</td>
                <td className="mono">{analytics.spatialPresence.min.toFixed(2)}</td>
                <td className="mono">{analytics.spatialPresence.median.toFixed(2)}</td>
                <td className="mono">{analytics.spatialPresence.max.toFixed(2)}</td>
                <td>Sensação física de estar localizado dentro do ambiente virtual</td>
              </tr>
              <tr>
                <td>
                  <strong>Envolvimento</strong> (Involvement)
                </td>
                <td className="mono">INV</td>
                <td className="mono">
                  <strong>{inv.toFixed(2)}</strong>
                </td>
                <td className="mono">{analytics.involvement.sd.toFixed(2)}</td>
                <td className="mono">{analytics.involvement.min.toFixed(2)}</td>
                <td className="mono">{analytics.involvement.median.toFixed(2)}</td>
                <td className="mono">{analytics.involvement.max.toFixed(2)}</td>
                <td>Grau de atenção e engajamento com o ambiente imersivo</td>
              </tr>
              <tr>
                <td>
                  <strong>Realismo Experenciado</strong> (Experienced Realism)
                </td>
                <td className="mono">REAL</td>
                <td className="mono">
                  <strong>{real.toFixed(2)}</strong>
                </td>
                <td className="mono">{analytics.experiencedRealism.sd.toFixed(2)}</td>
                <td className="mono">{analytics.experiencedRealism.min.toFixed(2)}</td>
                <td className="mono">{analytics.experiencedRealism.median.toFixed(2)}</td>
                <td className="mono">{analytics.experiencedRealism.max.toFixed(2)}</td>
                <td>Percepção de quão coerente e realista o ambiente parece</td>
              </tr>
              <tr>
                <td>
                  <strong>Presença Global</strong> (Global Presence)
                </td>
                <td className="mono">GP</td>
                <td className="mono">
                  <span className="sus-score-highlight">{gp.toFixed(2)}</span>
                </td>
                <td className="mono">{analytics.globalPresence.sd.toFixed(2)}</td>
                <td className="mono">{analytics.globalPresence.min.toFixed(2)}</td>
                <td className="mono">{analytics.globalPresence.median.toFixed(2)}</td>
                <td className="mono">{analytics.globalPresence.max.toFixed(2)}</td>
                <td>Indicador geral (média das 3 dimensões SP, INV e REAL)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="survey-charts-grid-2">
        <Panel
          title="Presence Profile Chart (Figura 8 do Toolkit)"
          action={<span className="mono muted-copy">Triângulo SP · REAL · INV + GP</span>}
        >
          <IpqPresenceProfileChart gp={gp} inv={inv} real={real} sp={sp} />
        </Panel>

        <Panel
          title="Comparativo das 4 Dimensões do IPQ (Média ± DP)"
          action={<span className="mono muted-copy">Escala 1 a 5</span>}
        >
          <IpqDimensionBarChart analytics={analytics} />
        </Panel>
      </div>

      <Panel title="Média Ajustada por Item do IPQ (Itens 1–14)">
        <div className="sus-likert-rows">
          {IPQ_ITEMS.map((item) => {
            const val = analytics.itemMeans[item.id] ?? 0;
            const pct = (val / 5) * 100;
            return (
              <div className="sus-likert-row" key={item.id}>
                <div className="sus-likert-question">
                  <span className="mono">
                    <strong>{item.id}</strong> ({item.subscale}
                    {item.reversed ? " · invertido" : ""})
                  </span>
                  <p>{item.text[lang]}</p>
                </div>
                <div className="sus-bar-single-track">
                  <div
                    className="sus-bar-single-fill"
                    style={{
                      width: `${pct}%`,
                      background: val >= 3.8 ? "#177a45" : val >= 3.0 ? "#2f6db0" : "#8a5d0b",
                    }}
                  />
                </div>
                <div className="sus-likert-score mono">
                  <strong>{val.toFixed(2)}</strong>/5
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function IpqPresenceProfileChart({
  sp,
  inv,
  real,
  gp,
}: {
  sp: number;
  inv: number;
  real: number;
  gp: number;
}) {
  const size = 340;
  const cx = size / 2;
  const cy = size / 2 + 12;
  const radius = 112;

  const axes = [
    { label: `SP (${sp.toFixed(2)})`, value: sp, angle: -Math.PI / 2 },
    { label: `REAL (${real.toFixed(2)})`, value: real, angle: Math.PI / 6 },
    { label: `INV (${inv.toFixed(2)})`, value: inv, angle: (5 * Math.PI) / 6 },
  ];

  const pt = (angle: number, val: number) => {
    const r = (Math.max(0, Math.min(5, val)) / 5) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const poly = axes
    .map((a) => {
      const p = pt(a.angle, a.value);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");

  const gpRadius = (Math.max(0, Math.min(5, gp)) / 5) * radius;

  return (
    <div className="survey-radar-wrapper">
      <svg aria-label="IPQ Presence Profile Chart" className="survey-radar-svg" viewBox={`0 0 ${size} ${size}`}>
        {[1, 2, 3, 4, 5].map((lvl) => {
          const ringPoly = axes
            .map((a) => {
              const p = pt(a.angle, lvl);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(" ");
          return (
            <polygon
              fill="none"
              key={lvl}
              points={ringPoly}
              stroke="rgba(27,35,51,0.12)"
              strokeDasharray={lvl === 5 ? undefined : "3 3"}
            />
          );
        })}

        {/* Círculo tracejado de Presença Global (GP) */}
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          r={gpRadius}
          stroke="#177a45"
          strokeDasharray="5 4"
          strokeWidth={2}
        />

        {axes.map((a) => {
          const outer = pt(a.angle, 5);
          const lbl = pt(a.angle, 5.9);
          const valPt = pt(a.angle, a.value);
          return (
            <g key={a.label}>
              <line stroke="rgba(27,35,51,0.2)" x1={cx} x2={outer.x} y1={cy} y2={outer.y} />
              <text
                dominantBaseline="middle"
                fill="#1b2333"
                fontSize={11}
                fontWeight={700}
                textAnchor="middle"
                x={lbl.x}
                y={lbl.y}
              >
                {a.label}
              </text>
              <circle cx={valPt.x} cy={valPt.y} fill="#2f4d80" r={4.5} stroke="#ffffff" strokeWidth={1.5} />
            </g>
          );
        })}

        <polygon fill="rgba(47, 109, 176, 0.28)" points={poly} stroke="#2f4d80" strokeWidth={2.4} />
        <text fill="#177a45" fontSize={11} fontWeight={700} textAnchor="middle" x={cx} y={size - 10}>
          {`Anel tracejado: Global Presence (GP) = ${gp.toFixed(2)} / 5.00`}
        </text>
      </svg>
    </div>
  );
}

function IpqDimensionBarChart({ analytics }: { analytics: IpqStudyAnalytics }) {
  const rows = [
    { label: "Spatial Presence (SP)", stats: analytics.spatialPresence, color: "#2f4d80" },
    { label: "Involvement (INV)", stats: analytics.involvement, color: "#2f6db0" },
    { label: "Experienced Realism (REAL)", stats: analytics.experiencedRealism, color: "#8a5d0b" },
    { label: "Global Presence (GP)", stats: analytics.globalPresence, color: "#177a45" },
  ];

  return (
    <div className="survey-bars-vertical-stack">
      {rows.map((r) => (
        <div className="survey-bar-metric-row" key={r.label}>
          <div className="survey-bar-metric-head">
            <strong>{r.label}</strong>
            <span className="mono">
              {r.stats.mean.toFixed(2)} ± {r.stats.sd.toFixed(2)} (Mín {r.stats.min.toFixed(1)} / Máx{" "}
              {r.stats.max.toFixed(1)})
            </span>
          </div>
          <div className="sus-bar-single-track">
            <div
              className="sus-bar-single-fill"
              style={{ width: `${(r.stats.mean / 5) * 100}%`, background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSQ-VR Charts (Section 4 of SELECT-IVE Toolkit: Tables 10 & 11 + Cut-offs)
// ---------------------------------------------------------------------------

export function CsqVrAnalyticsPanel({ analytics }: { analytics: CsqVrStudyAnalytics }) {
  if (analytics.sampleSize === 0) {
    return (
      <Panel title="Cybersickness in Virtual Reality Questionnaire (CSQ-VR)">
        <p className="empty-state">
          Nenhum formulário CSQ-VR registrado ainda. Aplique o CSQ-VR ou importe um CSV para analisar os sintomas.
        </p>
      </Panel>
    );
  }

  const { post, pre, deltaMean } = analytics;

  return (
    <div className="survey-analytics-stack">
      <Panel
        title="CSQ-VR · Estatística Descritiva dos Escores (Tabela 10 — Kourtesis et al., 2023)"
        action={
          <StatusPill
            tone={post.total.mean < 9 ? "ok" : post.total.mean < 14 ? "warn" : "error"}
            label={`CSQ-VR Total Médio: ${post.total.mean.toFixed(1)} / 42 (${analytics.aboveVrCutoffCount} >= corte VR 9)`}
          />
        }
      >
        <div className="table-scroll">
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>Medida (Pós-Exposição)</th>
                <th>Faixa da Escala</th>
                <th>Média (Mean)</th>
                <th>DP (SD)</th>
                <th>Mín</th>
                <th>Máx</th>
                <th>Referência / Interpretação</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Nausea score</strong> (Nausea A + B)
                </td>
                <td className="mono">2–14</td>
                <td className="mono">
                  <strong>{post.nausea.mean.toFixed(2)}</strong>
                </td>
                <td className="mono">{post.nausea.sd.toFixed(2)}</td>
                <td className="mono">{post.nausea.min}</td>
                <td className="mono">{post.nausea.max}</td>
                <td>Desconforto estomacal, náusea, tontura</td>
              </tr>
              <tr>
                <td>
                  <strong>Vestibular score</strong> (Vestibular A + B)
                </td>
                <td className="mono">2–14</td>
                <td className="mono">
                  <strong>{post.vestibular.mean.toFixed(2)}</strong>
                </td>
                <td className="mono">{post.vestibular.sd.toFixed(2)}</td>
                <td className="mono">{post.vestibular.min}</td>
                <td className="mono">{post.vestibular.max}</td>
                <td>Desorientação espacial, desequilíbrio, vertigem</td>
              </tr>
              <tr>
                <td>
                  <strong>Oculomotor score</strong> (Oculomotor A + B)
                </td>
                <td className="mono">2–14</td>
                <td className="mono">
                  <strong>{post.oculomotor.mean.toFixed(2)}</strong>
                </td>
                <td className="mono">{post.oculomotor.sd.toFixed(2)}</td>
                <td className="mono">{post.oculomotor.min}</td>
                <td className="mono">{post.oculomotor.max}</td>
                <td>Fadiga visual, vista cansada, dor de cabeça</td>
              </tr>
              <tr>
                <td>
                  <strong>CSQ-VR Total Score</strong>
                </td>
                <td className="mono">6–42</td>
                <td className="mono">
                  <span className="sus-score-highlight">{post.total.mean.toFixed(2)}</span>
                </td>
                <td className="mono">{post.total.sd.toFixed(2)}</td>
                <td className="mono">{post.total.min}</td>
                <td className="mono">{post.total.max}</td>
                <td>
                  Cortes de atenção: ≥ 9 (versão VR: {analytics.aboveVrCutoffCount}/{analytics.sampleSize}) · ≥ 10
                  (papel: {analytics.abovePaperCutoffCount}/{analytics.sampleSize})
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="survey-charts-grid-2">
        <Panel title="Intensidade por Categoria de Sintoma (2–14) e Escore Total (6–42)">
          <div className="survey-bars-vertical-stack">
            {[
              { label: "Náusea (2–14)", val: post.nausea.mean, sd: post.nausea.sd, max: 14 },
              { label: "Vestibular (2–14)", val: post.vestibular.mean, sd: post.vestibular.sd, max: 14 },
              { label: "Oculomotor (2–14)", val: post.oculomotor.mean, sd: post.oculomotor.sd, max: 14 },
              { label: "Total CSQ-VR (6–42)", val: post.total.mean, sd: post.total.sd, max: 42 },
            ].map((item) => {
              const pct = (item.val / item.max) * 100;
              const isHigh = item.max === 42 ? item.val >= 10 : item.val >= 5;
              return (
                <div className="survey-bar-metric-row" key={item.label}>
                  <div className="survey-bar-metric-head">
                    <strong>{item.label}</strong>
                    <span className="mono">
                      {item.val.toFixed(2)} ± {item.sd.toFixed(2)}
                    </span>
                  </div>
                  <div className="sus-bar-single-track">
                    <div
                      className="sus-bar-single-fill"
                      style={{
                        width: `${pct}%`,
                        background: isHigh ? "#c2362a" : "#177a45",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Comparação Pré vs. Pós-Exposição (Tabela 11 do Toolkit)"
          action={<span className="mono muted-copy">{analytics.preCount} sujeitos com baseline Pré-VR</span>}
        >
          {pre && deltaMean ? (
            <div className="table-scroll">
              <table className="data-table report-table">
                <thead>
                  <tr>
                    <th>Medida</th>
                    <th>Antes da RV (Before VR)</th>
                    <th>Após a RV (After VR)</th>
                    <th>Diferença (Δ)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Nausea score</td>
                    <td className="mono">{pre.nausea.mean.toFixed(2)}</td>
                    <td className="mono">{post.nausea.mean.toFixed(2)}</td>
                    <td className="mono">{formatSigned(deltaMean.nausea)}</td>
                  </tr>
                  <tr>
                    <td>Vestibular score</td>
                    <td className="mono">{pre.vestibular.mean.toFixed(2)}</td>
                    <td className="mono">{post.vestibular.mean.toFixed(2)}</td>
                    <td className="mono">{formatSigned(deltaMean.vestibular)}</td>
                  </tr>
                  <tr>
                    <td>Oculomotor score</td>
                    <td className="mono">{pre.oculomotor.mean.toFixed(2)}</td>
                    <td className="mono">{post.oculomotor.mean.toFixed(2)}</td>
                    <td className="mono">{formatSigned(deltaMean.oculomotor)}</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>CSQ-VR Total Score</strong>
                    </td>
                    <td className="mono">{pre.total.mean.toFixed(2)}</td>
                    <td className="mono">
                      <strong>{post.total.mean.toFixed(2)}</strong>
                    </td>
                    <td className="mono">
                      <strong>{formatSigned(deltaMean.total)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">
              Ative o preenchimento opcional “Baseline Pré-VR” ao aplicar o CSQ-VR para comparar sintomas antes e depois
              da imersão.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UTAUT2 Charts (Section 5 of Toolkit: Table 17 Alpha + Correlation Matrix)
// ---------------------------------------------------------------------------

export function Utaut2AnalyticsPanel({
  analytics,
  lang,
}: {
  analytics: Utaut2StudyAnalytics;
  lang: SurveyLanguage;
}) {
  if (analytics.sampleSize === 0) {
    return (
      <Panel title="Unified Theory of Acceptance and Use of Technology 2 (UTAUT2)">
        <p className="empty-state">
          Nenhum formulário UTAUT2 registrado ainda. Aplique o UTAUT2 ou importe um CSV para calcular confiabilidade
          (Alfa de Cronbach) e matriz de correlações.
        </p>
      </Panel>
    );
  }

  return (
    <div className="survey-analytics-stack">
      <Panel
        title="UTAUT2 · Estatística Descritiva, Confiabilidade (Alfa de Cronbach α) e Matriz de Correlação de Pearson (Tabela 17)"
        action={
          <StatusPill
            tone={analytics.overallMean >= 3.8 ? "ok" : "warn"}
            label={`Aceitação Geral ${analytics.overallMean.toFixed(2)} / 5.00 (N=${analytics.sampleSize})`}
          />
        }
      >
        <p className="muted-copy">
          Os coeficientes Alfa de Cronbach (α) aparecem na diagonal principal entre parênteses; as células fora da
          diagonal exibem a correlação de Pearson (r) entre os escores compostos dos construtos.
        </p>
        <div className="table-scroll">
          <table className="data-table report-table utaut2-matrix-table">
            <thead>
              <tr>
                <th>Construto</th>
                <th>Mean</th>
                <th>SD</th>
                <th>Confiabilidade (α)</th>
                {UTAUT2_CONSTRUCTS.map((c) => (
                  <th className="mono" key={c.id}>
                    {c.id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {UTAUT2_CONSTRUCTS.map((c) => {
                const row = analytics.constructs[c.id];
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.id}</strong> · {c.name[lang]}
                    </td>
                    <td className="mono">
                      <strong>{row.mean.toFixed(2)}</strong>
                    </td>
                    <td className="mono">{row.sd.toFixed(2)}</td>
                    <td>
                      <StatusPill
                        tone={
                          row.cronbachAlpha !== null && row.cronbachAlpha >= 0.7
                            ? "ok"
                            : row.cronbachAlpha !== null && row.cronbachAlpha >= 0.6
                              ? "warn"
                              : "muted"
                        }
                        label={row.alphaInterpretation}
                      />
                    </td>
                    {UTAUT2_CONSTRUCTS.map((col) => {
                      if (col.id === c.id) {
                        return (
                          <td className="mono utaut2-diag-cell" key={col.id}>
                            <strong>({row.cronbachAlpha !== null ? row.cronbachAlpha.toFixed(2) : "--"})</strong>
                          </td>
                        );
                      }
                      const rVal = row.correlations[col.id] ?? 0;
                      const intensity = Math.min(0.35, Math.abs(rVal) * 0.4);
                      const bg =
                        rVal >= 0
                          ? `rgba(23, 122, 69, ${intensity.toFixed(2)})`
                          : `rgba(194, 54, 42, ${intensity.toFixed(2)})`;
                      return (
                        <td className="mono" key={col.id} style={{ background: bg }}>
                          {rVal.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Escores Compostos por Construto do UTAUT2 (1 a 5)">
        <div className="survey-bars-vertical-stack">
          {UTAUT2_CONSTRUCTS.map((c) => {
            const stat = analytics.constructs[c.id];
            return (
              <div className="survey-bar-metric-row" key={c.id}>
                <div className="survey-bar-metric-head">
                  <strong>{c.name[lang]}</strong>
                  <span className="mono">
                    Média {stat.mean.toFixed(2)} ± {stat.sd.toFixed(2)} · Moda {stat.mode}
                  </span>
                </div>
                <div className="sus-bar-single-track">
                  <div
                    className="sus-bar-single-fill"
                    style={{
                      width: `${(stat.mean / 5) * 100}%`,
                      background: stat.mean >= 3.8 ? "#177a45" : stat.mean >= 3.0 ? "#2f6db0" : "#8a5d0b",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Estatística Descritiva por Item do UTAUT2 (Figura 11 — Média, Moda, DP e % Likert)">
        <div className="table-scroll">
          <table className="data-table report-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Construto</th>
                <th>Mean</th>
                <th>Mode</th>
                <th>SD</th>
                {LIKERT_5_LABELS[lang].map((lbl, idx) => (
                  <th key={lbl}>{`${idx + 1} (%)`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analytics.items.map((item) => (
                <tr key={item.id}>
                  <td className="mono">
                    <strong>{item.id}</strong>
                  </td>
                  <td className="mono">{item.construct}</td>
                  <td className="mono">{item.mean.toFixed(2)}</td>
                  <td className="mono">{item.mode}</td>
                  <td className="mono">{item.sd.toFixed(2)}</td>
                  {item.percentages.map((pct, i) => (
                    <td className="mono" key={i}>
                      {pct.toFixed(1)}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sentiment & Multimodal Triangulation Charts (Section 6 of Toolkit)
// ---------------------------------------------------------------------------

export function SentimentAnalyticsPanel({
  analytics,
  records,
  lang,
}: {
  analytics: SentimentStudyAnalytics;
  records: SubjectSurveyRecord[];
  lang: SurveyLanguage;
}) {
  const [xAxisMetric, setXAxisMetric] = useState<
    "similarity" | "presence" | "bodyEngagement" | "susScore" | "ipqGlobal" | "csqTotal" | "bpmAvg" | "rrAvgMs"
  >("similarity");

  if (analytics.sampleSize === 0) {
    return (
      <Panel title="Análise de Sentimento Pós-Exposição & Triangulação">
        <p className="empty-state">
          Nenhum relato de análise de sentimento registrado ainda. Preencha os relatos pós-exposição ou importe um CSV
          para visualizar a distribuição afetiva, correlações de Spearman e convergência/divergência.
        </p>
      </Panel>
    );
  }

  const pos = analytics.distribution.positive;
  const neu = analytics.distribution.neutral;
  const neg = analytics.distribution.negative;

  return (
    <div className="survey-analytics-stack">
      <div className="survey-charts-grid-2">
        <Panel
          title="Distribuição das Classificações de Sentimento (Figura 25)"
          action={
            <StatusPill
              tone={analytics.avgPc1 > 0.05 ? "ok" : analytics.avgPc1 < -0.05 ? "error" : "warn"}
              label={`PC1 Médio: ${analytics.avgPc1.toFixed(3)} ± ${analytics.sdPc1.toFixed(3)}`}
            />
          }
        >
          <div className="survey-bars-vertical-stack">
            {[
              { label: "Positivo (score > +0.05)", data: pos, color: "#177a45" },
              { label: "Neutro (|score| ≤ 0.05)", data: neu, color: "#8a5d0b" },
              { label: "Negativo (score < -0.05)", data: neg, color: "#c2362a" },
            ].map((row) => (
              <div className="survey-bar-metric-row" key={row.label}>
                <div className="survey-bar-metric-head">
                  <strong>{row.label}</strong>
                  <span className="mono">
                    {row.data.count} participantes ({row.data.percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="sus-bar-single-track">
                  <div
                    className="sus-bar-single-fill"
                    style={{ width: `${row.data.percentage}%`, background: row.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Padrões de Convergência e Divergência (Seção 6.7)">
          <div className="table-scroll">
            <table className="data-table report-table">
              <thead>
                <tr>
                  <th>Dimensão Avaliada</th>
                  <th>Convergência</th>
                  <th>Divergência Forte (High × Neg)</th>
                  <th>Divergência Moderada (High × Neu)</th>
                  <th>Divergência Inversa (Low × Pos)</th>
                </tr>
              </thead>
              <tbody>
                {analytics.divergenceTable.map((row) => (
                  <tr key={row.dimensionId}>
                    <td>
                      <strong>{lang === "pt" ? row.labelPt : row.labelEn}</strong>
                    </td>
                    <td className="mono">{row.convergence}</td>
                    <td className="mono">
                      <strong style={{ color: row.strongDivergence > 0 ? "#c2362a" : undefined }}>
                        {row.strongDivergence}
                      </strong>
                    </td>
                    <td className="mono">{row.softDivergence}</td>
                    <td className="mono">{row.inverseDivergence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="survey-charts-grid-2">
        <Panel title="Correlações de Spearman (ρ) com Medidas Psicométricas e Sensores (Tabela 23)">
          <div className="table-scroll">
            <table className="data-table report-table">
              <thead>
                <tr>
                  <th>Dimensão / Variável</th>
                  <th>N</th>
                  <th>Spearman (ρ)</th>
                  <th>p-value</th>
                  <th>Alinhamento</th>
                </tr>
              </thead>
              <tbody>
                {analytics.spearmanCorrelations.map((row) => (
                  <tr key={row.dimensionId}>
                    <td>
                      <strong>{lang === "pt" ? row.labelPt : row.labelEn}</strong>
                    </td>
                    <td className="mono">{row.n}</td>
                    <td className="mono">
                      <strong>
                        {row.rho.toFixed(2)}
                        {row.significant ? "*" : ""}
                      </strong>
                    </td>
                    <td className="mono">{row.pValue.toFixed(3)}</td>
                    <td>
                      <StatusPill
                        tone={row.significant ? "ok" : "muted"}
                        label={row.significant ? "Significativo (p < 0.05)" : "Exploratório"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Inspeção Visual: Gráfico de Dispersão (Figura 26)"
          action={
            <select
              aria-label="Métrica do eixo X"
              value={xAxisMetric}
              onChange={(e) => setXAxisMetric(e.target.value as typeof xAxisMetric)}
            >
              <option value="similarity">Eixo X: Similaridade com Tarefa Real (Likert 1–5)</option>
              <option value="presence">Eixo X: Presença Percebida (Likert 1–5)</option>
              <option value="bodyEngagement">Eixo X: Engajamento Corporal (Likert 1–5)</option>
              <option value="susScore">Eixo X: Escore SUS (0–100)</option>
              <option value="ipqGlobal">Eixo X: IPQ Presença Global (1–5)</option>
              <option value="csqTotal">Eixo X: CSQ-VR Total (6–42)</option>
              <option value="bpmAvg">Eixo X: Sensor BPM Médio</option>
              <option value="rrAvgMs">Eixo X: Sensor RR Médio (ms)</option>
            </select>
          }
        >
          <SentimentScatterPlot metric={xAxisMetric} records={records} />
        </Panel>
      </div>
    </div>
  );
}

function SentimentScatterPlot({
  records,
  metric,
}: {
  records: SubjectSurveyRecord[];
  metric:
    | "similarity"
    | "presence"
    | "bodyEngagement"
    | "susScore"
    | "ipqGlobal"
    | "csqTotal"
    | "bpmAvg"
    | "rrAvgMs";
}) {
  const points = records
    .map((r) => {
      const y = r.sentiment?.avgSentimentPc1;
      const x =
        metric === "similarity"
          ? r.sentiment?.likert.similarity
          : metric === "presence"
            ? r.sentiment?.likert.presence
            : metric === "bodyEngagement"
              ? r.sentiment?.likert.bodyEngagement
              : metric === "susScore"
                ? r.sus?.score
                : metric === "ipqGlobal"
                  ? r.ipq?.globalPresence
                  : metric === "csqTotal"
                    ? r.csqVr?.post.total
                    : metric === "bpmAvg"
                      ? r.sessionSummary?.bpmAvg
                      : r.sessionSummary?.rrAvgMs;
      return typeof x === "number" && typeof y === "number"
        ? { id: r.subjectId, x, y, label: r.sentiment?.finalLabel ?? "neutral" }
        : null;
    })
    .filter((pt): pt is NonNullable<typeof pt> => pt !== null);

  if (points.length === 0) {
    return <p className="empty-state">Sem pares de dados suficientes para esta métrica.</p>;
  }

  const width = 480;
  const height = 240;
  const padL = 48;
  const padR = 24;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xVals = points.map((p) => p.x);
  const minX = Math.min(...xVals);
  const maxX = Math.max(...xVals);
  const spanX = Math.max(1, maxX - minX);
  const domainMinX = minX - spanX * 0.1;
  const domainMaxX = maxX + spanX * 0.1;

  const yVals = points.map((p) => p.y);
  const minY = Math.min(-0.2, ...yVals);
  const maxY = Math.max(0.4, ...yVals);
  const spanY = Math.max(0.2, maxY - minY);

  const xFor = (v: number) => padL + ((v - domainMinX) / (domainMaxX - domainMinX)) * plotW;
  const yFor = (v: number) => padT + plotH - ((v - minY) / spanY) * plotH;

  const zeroY = yFor(0);

  return (
    <svg aria-label="Scatter Plot Sentimento vs Métrica" className="survey-svg-chart" viewBox={`0 0 ${width} ${height}`}>
      <rect className="chart-frame" height={plotH} rx={6} width={plotW} x={padL} y={padT} />
      {/* Faixa de neutralidade [-0.05, +0.05] */}
      <rect
        fill="rgba(138, 93, 11, 0.08)"
        height={Math.abs(yFor(-0.05) - yFor(0.05))}
        width={plotW}
        x={padL}
        y={Math.min(yFor(0.05), yFor(-0.05))}
      />
      <line
        stroke="rgba(27,35,51,0.28)"
        strokeDasharray="4 4"
        x1={padL}
        x2={padL + plotW}
        y1={zeroY}
        y2={zeroY}
      />

      {[minY, 0, maxY].map((yv, idx) => (
        <text
          className="chart-axis-label"
          dominantBaseline="middle"
          key={idx}
          textAnchor="end"
          x={padL - 6}
          y={yFor(yv)}
        >
          {yv.toFixed(2)}
        </text>
      ))}

      {points.map((pt, i) => {
        const cx = xFor(pt.x);
        const cy = yFor(pt.y);
        const color =
          pt.label === "positive" ? "#177a45" : pt.label === "negative" ? "#c2362a" : "#8a5d0b";
        return (
          <g key={`${pt.id}-${i}`}>
            <circle cx={cx} cy={cy} fill={color} opacity={0.85} r={5.5} stroke="#ffffff" strokeWidth={1.5}>
              <title>{`${pt.id}: X=${pt.x.toFixed(2)}, Sentiment PC1=${pt.y.toFixed(3)} (${pt.label})`}</title>
            </circle>
            <text fill="#1b2333" fontSize={9} fontWeight={600} x={cx + 7} y={cy + 3}>
              {pt.id}
            </text>
          </g>
        );
      })}

      <text fill="#616b7e" fontSize={10} fontWeight={600} textAnchor="middle" x={padL + plotW / 2} y={height - 6}>
        {`Eixo X: ${metric} · Eixo Y: Sentimento Médio (PC1)`}
      </text>
    </svg>
  );
}

function formatSigned(val: number): string {
  return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
}
