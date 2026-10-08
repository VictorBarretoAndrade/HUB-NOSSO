import { useEffect, useMemo, useRef } from "react";
import type { View } from "../../app/navigation";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import { activeSensorId, downsample, ecgEvents, flattenEcg, latestScalar, scalarSeries } from "../../domain/liveSignal";
import type { StreamEvent } from "../../domain/types";
import { SensorMetric } from "../sensors/SensorMetric";
import { TrendChart } from "./TrendChart";

const ECG_MAX_SAMPLES = 2000;
const ECG_WIDTH = 1000;
const ECG_HEIGHT = 240;
const ECG_VERTICAL_PADDING = 5;
const TREND_MAX_POINTS = 120;
const FALLBACK_TRACE_COLOR = "#c0362b";

/** Cor do traço vem do tema (--heart), para o canvas acompanhar o resto da interface. */
function traceColor(element: Element): string {
  return getComputedStyle(element).getPropertyValue("--heart").trim() || FALLBACK_TRACE_COLOR;
}

function drawEcg(canvas: HTMLCanvasElement, values: number[]): void {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, ECG_WIDTH, ECG_HEIGHT);
  if (values.length < 2) {
    return;
  }
  const points = downsample(values, ECG_WIDTH);
  const min = Math.min(...points);
  const range = Math.max(...points) - min || 1;
  const drawableHeight = ECG_HEIGHT - ECG_VERTICAL_PADDING * 2;

  context.beginPath();
  context.strokeStyle = traceColor(canvas);
  context.lineWidth = 1;
  points.forEach((value, index) => {
    const x = (index / (points.length - 1)) * ECG_WIDTH;
    const y = ECG_HEIGHT - ((value - min) / range) * drawableHeight - ECG_VERTICAL_PADDING;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();
}

function formatRounded(value: number | undefined): string {
  return typeof value === "number" ? String(Math.round(value)) : "--";
}

interface LiveViewProps {
  events: StreamEvent[];
  onNavigate: (view: View) => void;
}

/**
 * Monitor ao vivo. O ECG é desenhado em canvas a partir da janela de eventos já
 * limitada pelo stream; não há atualização de estado por amostra.
 */
export function LiveView({ events, onNavigate }: LiveViewProps) {
  const sensorId = activeSensorId(events);
  const sensorEvents = useMemo(() => ecgEvents(events, sensorId), [events, sensorId]);
  const ecg = useMemo(() => flattenEcg(sensorEvents, ECG_MAX_SAMPLES), [sensorEvents]);
  const bpmSeries = useMemo(() => scalarSeries(sensorEvents, "bpm", TREND_MAX_POINTS), [sensorEvents]);
  const rrSeries = useMemo(() => scalarSeries(sensorEvents, "rrMs", TREND_MAX_POINTS), [sensorEvents]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasEcg = ecg.length >= 2;

  useEffect(() => {
    if (canvasRef.current) {
      drawEcg(canvasRef.current, ecg);
    }
  }, [ecg]);

  if (!sensorId) {
    return (
      <section className="content-grid">
        <Panel title="Monitor ao vivo" action={<StatusPill tone="muted" label="Sem sensor" />}>
          <p className="empty-state">
            Nenhum sensor está publicando <span className="mono">hrv.raw</span> agora. Conecte um sensor (por exemplo, a
            ponte do Polar H10) ou rode o simulador com <code>biofeedback-sim --mode hrv-ecg</code>.
          </p>
          <div className="form-actions">
            <button className="command-button" type="button" onClick={() => onNavigate("clients")}>
              Ver clientes conectados
            </button>
            <button className="command-button" type="button" onClick={() => onNavigate("guide")}>
              Abrir o guia de uso
            </button>
          </div>
        </Panel>
      </section>
    );
  }

  return (
    <section className="content-grid subject-grid">
      <Panel title="ECG ao vivo" action={<StatusPill tone="ok" label={sensorId} />}>
        <canvas
          aria-label={hasEcg ? `Waveform de ECG ao vivo do sensor ${sensorId}` : "Waveform de ECG indisponível"}
          className="live-canvas"
          height={ECG_HEIGHT}
          ref={canvasRef}
          role="img"
          width={ECG_WIDTH}
        />
        <p className="muted-copy">
          {hasEcg
            ? `${ecg.length} amostras na janela.`
            : "Este sensor não envia ECG bruto: HR e RR continuam disponíveis ao lado. No simulador, use o modo hrv-ecg para ver a waveform."}
        </p>
      </Panel>

      <Panel title="Métricas e tendência">
        <div className="live-metrics">
          <SensorMetric label="BPM" value={formatRounded(latestScalar(sensorEvents, "bpm"))} />
          <SensorMetric label="RR (ms)" value={formatRounded(latestScalar(sensorEvents, "rrMs"))} />
        </div>
        <TrendChart label="HR (bpm)" series={bpmSeries} />
        <TrendChart label="RR (ms)" series={rrSeries} />
      </Panel>
    </section>
  );
}
