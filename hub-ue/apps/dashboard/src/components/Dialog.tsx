import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  /** Contexto curto acima do título (ex.: "Confirmar comando"). */
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** Botões de ação; o primeiro deve ser sempre a saída segura (Cancelar). */
  actions: ReactNode;
  className?: string;
  onClose: () => void;
}

/**
 * Modal acessível: prende o foco, fecha com Esc ou clique fora e devolve o foco
 * ao elemento que o abriu. O foco inicial vai para a primeira ação (Cancelar).
 */
export function Dialog({ actions, children, className = "", eyebrow, onClose, title }: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    actionsRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`confirm-dialog ${className}`.trim()}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <span>{eyebrow}</span>
          <strong id={titleId}>{title}</strong>
        </header>
        {children}
        <div className="confirm-dialog-actions" ref={actionsRef}>
          {actions}
        </div>
      </section>
    </div>
  );
}
