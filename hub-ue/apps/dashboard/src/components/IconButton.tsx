import type { ReactNode } from "react";

/** Botão só com ícone; `label` vira o nome acessível e a dica ao passar o mouse. */
export function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="icon-button" onClick={onClick} title={label} type="button" aria-label={label}>
      {children}
    </button>
  );
}
