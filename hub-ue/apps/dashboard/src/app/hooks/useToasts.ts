import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_DURATION_MS = 4500;

export type ToastTone = "ok" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

export type Notify = (message: string, tone?: ToastTone) => void;

/** Avisos curtos e temporários que confirmam o resultado de uma ação do operador. */
export function useToasts(): { toasts: Toast[]; notify: Notify; dismiss: (id: number) => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback<Notify>(
    (message, tone = "ok") => {
      const id = nextIdRef.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      timersRef.current.set(id, window.setTimeout(() => dismiss(id), TOAST_DURATION_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  return { toasts, notify, dismiss };
}
