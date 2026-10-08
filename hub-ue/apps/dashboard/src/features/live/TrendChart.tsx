const WIDTH = 300;
const HEIGHT = 60;
const VERTICAL_PADDING = 4;

function toPolylinePoints(series: number[]): string | null {
  if (series.length < 2) {
    return null;
  }
  const min = Math.min(...series);
  const range = Math.max(...series) - min || 1;
  const drawableHeight = HEIGHT - VERTICAL_PADDING * 2;
  return series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * WIDTH;
      const y = HEIGHT - ((value - min) / range) * drawableHeight - VERTICAL_PADDING;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Sparkline de uma série escalar recente (HR ou RR). */
export function TrendChart({ label, series }: { label: string; series: number[] }) {
  const points = toPolylinePoints(series);
  const latest = series[series.length - 1];
  const description = points
    ? `Tendência de ${label}: ${series.length} pontos, mínimo ${Math.round(Math.min(...series))}, máximo ${Math.round(Math.max(...series))}, atual ${Math.round(latest)}.`
    : `Tendência de ${label}: aguardando amostras.`;

  return (
    <div className="trend-block">
      <span className="field-label">{label}</span>
      <svg
        aria-label={description}
        className="trend-svg"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {points && <polyline className="trend-line" fill="none" points={points} />}
      </svg>
    </div>
  );
}
