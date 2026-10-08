import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Contém falhas de renderização de uma tela para que o resto do dashboard siga operável. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[dashboard] falha ao renderizar a tela", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <section className="content-grid">
        <div className="error-fallback" role="alert">
          <strong>Esta tela encontrou um erro inesperado.</strong>
          <p>
            Os dados da experiência continuam salvos neste navegador. Tente abrir a tela de novo; se o erro persistir,
            recarregue a página.
          </p>
          <p className="mono">{this.state.error.message}</p>
          <div className="form-actions">
            <button className="command-button" type="button" onClick={() => this.setState({ error: null })}>
              Tentar de novo
            </button>
            <button className="command-button strong" type="button" onClick={() => window.location.reload()}>
              Recarregar página
            </button>
          </div>
        </div>
      </section>
    );
  }
}
