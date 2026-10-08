import { useCallback, useEffect, useRef, useState } from "react";
import { buildHello, buildMonitorSubscribe, toWebSocketEndpoint } from "../../domain/api";
import type { MessageEnvelope, SocketState, StreamEvent } from "../../domain/types";
import { useLatestRef } from "../../lib/useLatestRef";

const DASHBOARD_CLIENT_ID = "dashboard-ui";
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;

export interface HubSocketHandlers {
  /** Chamado para cada envelope recebido do hub. */
  onEvent: (event: StreamEvent) => void;
  /** Chamado quando a conexão cai sem ter sido encerrada pelo próprio dashboard. */
  onDisconnect: () => void;
  /** Chamado quando a conexão é descartada (troca de endpoint, reconexão, desmontagem). */
  onDispose: () => void;
}

export interface HubSocket {
  state: SocketState;
  error: string | null;
  isOpen: () => boolean;
  /** Envia um envelope; devolve false se o socket não está aberto ou o envio falhou. */
  send: (envelope: MessageEnvelope | Record<string, unknown>) => boolean;
  /** Assina tópicos extras descobertos em runtime (uma vez por conexão). */
  subscribe: (topics: string[]) => void;
  reconnect: () => void;
}

function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
}

/**
 * Mantém o WebSocket de monitoramento do dashboard: handshake, assinatura dos
 * tópicos oficiais e reconexão automática com backoff quando o hub cai.
 */
export function useHubSocket(endpoint: string, token: string, handlers: HubSocketHandlers): HubSocket {
  const [state, setState] = useState<SocketState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const failedAttemptsRef = useRef(0);
  const subscribedTopicsRef = useRef<Set<string>>(new Set());
  const handlersRef = useLatestRef(handlers);
  // Estável, para o cleanup do efeito chamar sempre o handler mais recente.
  const notifyDispose = useCallback(() => handlersRef.current.onDispose(), [handlersRef]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let socket: WebSocket;
    subscribedTopicsRef.current = new Set();

    const scheduleReconnect = () => {
      const delay = reconnectDelay(failedAttemptsRef.current);
      failedAttemptsRef.current += 1;
      retryTimer = window.setTimeout(() => setConnectionAttempt((attempt) => attempt + 1), delay);
    };

    setState((current) => (current === "reconnecting" ? current : "connecting"));
    try {
      socket = new WebSocket(toWebSocketEndpoint(endpoint, token));
    } catch {
      setState("error");
      setError("Não foi possível abrir o WebSocket do hub. Revise o endereço em Diagnóstico.");
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      if (cancelled) {
        return;
      }
      socket.send(JSON.stringify(buildHello(DASHBOARD_CLIENT_ID)));
      socket.send(JSON.stringify(buildMonitorSubscribe(DASHBOARD_CLIENT_ID)));
      failedAttemptsRef.current = 0;
      setError(null);
      setState("connected");
    };

    socket.onmessage = (message) => {
      let envelope: MessageEnvelope;
      try {
        envelope = JSON.parse(String(message.data)) as MessageEnvelope;
      } catch {
        setError("O hub enviou uma mensagem que não pôde ser lida.");
        return;
      }
      handlersRef.current.onEvent({ receivedAt: new Date().toISOString(), envelope });
    };

    socket.onclose = () => {
      if (cancelled) {
        return;
      }
      setState("reconnecting");
      setError("Conexão em tempo real com o hub perdida. Tentando reconectar automaticamente.");
      handlersRef.current.onDisconnect();
      scheduleReconnect();
    };

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      notifyDispose();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.close();
    };
  }, [connectionAttempt, endpoint, handlersRef, notifyDispose, token]);

  const isOpen = useCallback(() => socketRef.current?.readyState === WebSocket.OPEN, []);

  const send = useCallback((envelope: MessageEnvelope | Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      socket.send(JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }, []);

  const subscribe = useCallback(
    (topics: string[]) => {
      const pending = topics.filter((topic) => !subscribedTopicsRef.current.has(topic));
      if (pending.length === 0) {
        return;
      }
      const sent = send({ type: "subscribe", clientId: DASHBOARD_CLIENT_ID, payload: { topics: pending } });
      if (sent) {
        for (const topic of pending) {
          subscribedTopicsRef.current.add(topic);
        }
      }
    },
    [send],
  );

  const reconnect = useCallback(() => {
    failedAttemptsRef.current = 0;
    setConnectionAttempt((attempt) => attempt + 1);
  }, []);

  return { state, error, isOpen, send, subscribe, reconnect };
}
