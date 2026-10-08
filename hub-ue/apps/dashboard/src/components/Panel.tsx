import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  /** Controles ou status exibidos à direita do título. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Cartão com cabeçalho: a unidade básica de agrupamento de todas as telas. */
export function Panel({ action, children, className = "", title }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-header">
        <h2 className="panel-title">{title}</h2>
        {action}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
