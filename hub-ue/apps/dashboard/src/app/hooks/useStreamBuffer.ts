import { useCallback, useEffect, useRef, useState } from "react";
import { appendExperienceEvent } from "../../domain/experiencePersistence";
import type { StreamEvent } from "../../domain/types";

const LIVE_EVENT_LIMIT = 200;
const FALLBACK_FRAME_MS = 16;

type FlushHandle = { id: number; mode: "raf" | "timeout" };

export interface StreamBuffer {
  /** Janela dos eventos mais recentes (mais novo primeiro) usada pelas telas ao vivo. */
  events: StreamEvent[];
  /** Eventos capturados para a experiência corrente (persistidos e usados no relatório). */
  experienceEvents: StreamEvent[];
  /** Entrega imediata, para eventos que a interface precisa refletir na hora. */
  pushNow: (event: StreamEvent) => void;
  /** Telemetria de alta frequência: agrupada por frame para não re-renderizar a cada amostra. */
  queue: (event: StreamEvent, captureInExperience: boolean) => void;
  capture: (event: StreamEvent) => void;
  discardQueued: () => void;
}

export function useStreamBuffer(initialExperienceEvents: StreamEvent[]): StreamBuffer {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [experienceEvents, setExperienceEvents] = useState<StreamEvent[]>(initialExperienceEvents);
  const liveQueueRef = useRef<StreamEvent[]>([]);
  const experienceQueueRef = useRef<StreamEvent[]>([]);
  const flushHandleRef = useRef<FlushHandle | null>(null);

  const flush = useCallback(() => {
    flushHandleRef.current = null;
    const liveBatch = liveQueueRef.current.splice(0);
    const experienceBatch = experienceQueueRef.current.splice(0);
    if (liveBatch.length > 0) {
      setEvents((current) => [...liveBatch.reverse(), ...current].slice(0, LIVE_EVENT_LIMIT));
    }
    if (experienceBatch.length > 0) {
      setExperienceEvents((current) => experienceBatch.reduce((next, event) => appendExperienceEvent(next, event), current));
    }
  }, []);

  const cancelScheduledFlush = useCallback(() => {
    const handle = flushHandleRef.current;
    if (!handle) {
      return;
    }
    if (handle.mode === "raf") {
      window.cancelAnimationFrame(handle.id);
    } else {
      window.clearTimeout(handle.id);
    }
    flushHandleRef.current = null;
  }, []);

  const pushNow = useCallback(
    (event: StreamEvent) => {
      // Esvazia a fila antes para preservar a ordem de chegada.
      cancelScheduledFlush();
      flush();
      setEvents((current) => [event, ...current].slice(0, LIVE_EVENT_LIMIT));
    },
    [cancelScheduledFlush, flush],
  );

  const queue = useCallback(
    (event: StreamEvent, captureInExperience: boolean) => {
      liveQueueRef.current.push(event);
      if (captureInExperience) {
        experienceQueueRef.current.push(event);
      }
      if (flushHandleRef.current !== null) {
        return;
      }
      flushHandleRef.current =
        typeof window.requestAnimationFrame === "function"
          ? { id: window.requestAnimationFrame(flush), mode: "raf" }
          : { id: window.setTimeout(flush, FALLBACK_FRAME_MS), mode: "timeout" };
    },
    [flush],
  );

  const capture = useCallback((event: StreamEvent) => {
    setExperienceEvents((current) => appendExperienceEvent(current, event));
  }, []);

  const discardQueued = useCallback(() => {
    cancelScheduledFlush();
    liveQueueRef.current = [];
    experienceQueueRef.current = [];
  }, [cancelScheduledFlush]);

  useEffect(() => discardQueued, [discardQueued]);

  return { events, experienceEvents, pushNow, queue, capture, discardQueued };
}
