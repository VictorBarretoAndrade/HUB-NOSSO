import type { ReactNode } from "react";

export type StatusTone = "ok" | "warn" | "error" | "muted";

/** Selo de status: a cor reforça, mas o texto sempre carrega o significado. */
export function StatusPill({ icon, label, tone }: { icon?: ReactNode; label: string; tone: StatusTone }) {
  return (
    <span className={`status-pill ${tone}`}>
      {icon}
      {label}
    </span>
  );
}
