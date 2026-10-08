/** Par rótulo/valor compacto usado nos resumos de sensor. */
export function SensorMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="sensor-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
