import { useCallback, useEffect, useRef, useState } from "react";
import { describeHubError, fetchHealth, fetchStatus } from "../../domain/api";
import type { HealthResponse, StatusResponse } from "../../domain/types";
import { useLatestRef } from "../../lib/useLatestRef";

const STATUS_POLL_INTERVAL_MS = 3000;

/** "loading" distingue "ainda não sei" de "offline", para não alarmar antes da 1ª resposta. */
export type HubLinkState = "loading" | "online" | "offline";

export interface HubStatus {
  health: HealthResponse | null;
  status: StatusResponse | null;
  error: string | null;
  linkState: HubLinkState;
  refresh: () => Promise<void>;
}

/** Consulta /health e /status periodicamente e expõe o último retrato do hub. */
export function useHubStatus(endpoint: string, onStatus?: (status: StatusResponse) => void): HubStatus {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<HubLinkState>("loading");
  const latestRequestRef = useRef(0);
  const onStatusRef = useLatestRef(onStatus);

  const refresh = useCallback(async () => {
    // Respostas de pedidos antigos (endpoint trocado, polling sobreposto) são descartadas.
    const requestId = ++latestRequestRef.current;
    try {
      const [nextHealth, nextStatus] = await Promise.all([fetchHealth(endpoint), fetchStatus(endpoint)]);
      if (requestId !== latestRequestRef.current) {
        return;
      }
      setHealth(nextHealth);
      setStatus(nextStatus);
      setError(null);
      setLinkState(nextHealth.ok ? "online" : "offline");
      onStatusRef.current?.(nextStatus);
    } catch (cause) {
      if (requestId !== latestRequestRef.current) {
        return;
      }
      setHealth(null);
      setStatus(null);
      setError(describeHubError(cause, endpoint));
      setLinkState("offline");
    }
  }, [endpoint, onStatusRef]);

  useEffect(() => {
    setLinkState("loading");
    void refresh();
    const interval = window.setInterval(() => void refresh(), STATUS_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { health, status, error, linkState, refresh };
}
