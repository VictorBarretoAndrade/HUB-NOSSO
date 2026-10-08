import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import type { Toast } from "../app/hooks/useToasts";

/** Região de avisos temporários, anunciada por leitores de tela sem roubar o foco. */
export function ToastRegion({ onDismiss, toasts }: { onDismiss: (id: number) => void; toasts: Toast[] }) {
  return (
    <div aria-live="polite" className="toast-region" role="status">
      {toasts.map((toast) => (
        <div className={`toast ${toast.tone}`} key={toast.id}>
          {toast.tone === "ok" ? <CheckCircle2 aria-hidden size={16} /> : <TriangleAlert aria-hidden size={16} />}
          <span>{toast.message}</span>
          <button aria-label="Dispensar aviso" className="toast-dismiss" type="button" onClick={() => onDismiss(toast.id)}>
            <X aria-hidden size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
