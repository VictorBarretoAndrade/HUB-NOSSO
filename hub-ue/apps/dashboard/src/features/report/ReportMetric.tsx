export function ReportMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="report-health-metric">
      <em>{label}</em>
      <strong>{value}</strong>
    </span>
  );
}
