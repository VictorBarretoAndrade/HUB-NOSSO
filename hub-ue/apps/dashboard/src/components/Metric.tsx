export function Metric({ label, small, value }: { label: string; small?: boolean; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={small ? "small" : ""}>{value}</strong>
    </div>
  );
}
