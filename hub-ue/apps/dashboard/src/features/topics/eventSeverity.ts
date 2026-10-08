import type { StatusTone } from "../../components/StatusPill";

type EventSeverity = "ok" | "warn" | "error";

const SEVERITY_LABEL: Record<EventSeverity, string> = {
  ok: "Normal",
  warn: "Atenção",
  error: "Erro",
};

/** Eventos normais usam o tom neutro para que avisos e erros se destaquem na lista. */
export function severityTone(severity: EventSeverity): StatusTone {
  return severity === "ok" ? "muted" : severity;
}

export function severityLabel(severity: EventSeverity): string {
  return SEVERITY_LABEL[severity];
}

export function severityRowClass(severity: EventSeverity): string {
  if (severity === "error") return "error-row";
  if (severity === "warn") return "warn-row";
  return "";
}
