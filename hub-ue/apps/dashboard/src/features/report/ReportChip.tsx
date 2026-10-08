interface ReportChipProps {
  label: string;
  value: number;
  detail?: string;
  tone?: "ok" | "warn" | "muted";
}

/** Contador de destaque do resumo do relatório. */
export function ReportChip({ detail, label, tone = "muted", value }: ReportChipProps) {
  return (
    <div className={`report-chip ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <em>{detail}</em>}
    </div>
  );
}
