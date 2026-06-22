// Fase 4 — Visualização ao vivo (exigência ③).
//
// Componente fino: a lógica (janelas/decimação) vive em liveSignal.ts.
// O ECG é desenhado em <canvas> a partir de um array derivado dos eventos vivos
// (o array `events` já é a janela limitada — não há setState por amostra).

import { useEffect, useMemo, useRef } from "react";
import {
  activeSensorId,
  downsample,
  ecgEvents,
  flattenEcg,
  latestScalar,
  scalarSeries,
} from "./liveSignal";
import type { StreamEvent } from "./types";

const ECG_MAX_SAMPLES = 2000;
const ECG_W = 1000;
const ECG_H = 240;
const TREND_MAX_POINTS = 120;
const STROKE = "#c0362b";

function drawEcg(ctx: CanvasRenderingContext2D, values: number[], width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  if (values.length < 2) {
    return;
  }
  const points = downsample(values, width);
  let min = Infinity;
  let max = -Infinity;
  for (const value of points) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;
  ctx.beginPath();
  ctx.strokeStyle = STROKE;
  ctx.lineWidth = 1;
  points.forEach((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 10) - 5;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

function TrendChart({ label, series }: { label: string; series: number[] }) {
  const width = 300;
  const height = 60;
  let polyline: string | null = null;
  if (series.length >= 2) {
    let min = Infinity;
    let max = -Infinity;
    for (const value of series) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const range = max - min || 1;
    polyline = series
      .map((value, index) => {
        const x = (index / (series.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }
  return (
    <div className="trend-block">
      <span className="field-label">{label}</span>
      <svg className="trend-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {polyline && <polyline points={polyline} fill="none" stroke={STROKE} strokeWidth="1.5" />}
      </svg>
    </div>
  );
}

export function LiveView({ events }: { events: StreamEvent[] }) {
  const sensorId = activeSensorId(events);
  const sensorEvents = useMemo(() => ecgEvents(events, sensorId), [events, sensorId]);
  const ecg = useMemo(() => flattenEcg(sensorEvents, ECG_MAX_SAMPLES), [sensorEvents]);
  const bpmSeries = useMemo(() => scalarSeries(sensorEvents, "bpm", TREND_MAX_POINTS), [sensorEvents]);
  const rrSeries = useMemo(() => scalarSeries(sensorEvents, "rrMs", TREND_MAX_POINTS), [sensorEvents]);
  const bpm = latestScalar(sensorEvents, "bpm");
  const rr = latestScalar(sensorEvents, "rrMs");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      drawEcg(ctx, ecg, ECG_W, ECG_H);
    }
  }, [ecg]);

  if (!sensorId) {
    return (
      <section className="content-grid">
        <section className="panel">
          <div className="panel-body">
            <p className="empty-state">
              Sem dados de sensor ao vivo. Conecte um sensor (ex.: a ponte do Polar) publicando hrv.raw.
            </p>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="content-grid subject-grid">
      <section className="panel">
        <header className="panel-header">
          <span>ECG ao vivo</span>
          <span className="status-pill ok">{sensorId}</span>
        </header>
        <div className="panel-body">
          <canvas ref={canvasRef} className="live-canvas" width={ECG_W} height={ECG_H} />
          <p className="muted-copy">{ecg.length} amostras na janela.</p>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>Métricas e tendência</span>
        </header>
        <div className="panel-body">
          <div className="live-metrics">
            <div className="sensor-metric">
              <span>BPM</span>
              <strong>{typeof bpm === "number" ? Math.round(bpm) : "--"}</strong>
            </div>
            <div className="sensor-metric">
              <span>RR (ms)</span>
              <strong>{typeof rr === "number" ? Math.round(rr) : "--"}</strong>
            </div>
          </div>
          <TrendChart label="HR (bpm)" series={bpmSeries} />
          <TrendChart label="RR (ms)" series={rrSeries} />
        </div>
      </section>
    </section>
  );
}
