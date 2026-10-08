import { Bell, RefreshCw } from "lucide-react";
import { IconButton } from "../components/IconButton";
import { StatusPill } from "../components/StatusPill";
import type { StatusTone } from "../components/StatusPill";
import type { SocketState } from "../domain/types";
import type { HubLinkState } from "./hooks/useHubStatus";

interface TopbarProps {
  title: string;
  linkState: HubLinkState;
  socketState: SocketState;
  sessionId: string | undefined;
  pendingAckCount: number;
  onRefresh: () => void;
}

const HUB_STATUS: Record<HubLinkState, { label: string; tone: StatusTone }> = {
  loading: { label: "Conectando ao hub…", tone: "muted" },
  online: { label: "Hub online", tone: "ok" },
  offline: { label: "Hub offline", tone: "error" },
};

const STREAM_STATUS: Record<SocketState, { label: string; tone: StatusTone }> = {
  idle: { label: "Stream inativo", tone: "muted" },
  connecting: { label: "Conectando stream…", tone: "muted" },
  connected: { label: "Stream ao vivo", tone: "ok" },
  reconnecting: { label: "Reconectando stream…", tone: "warn" },
  error: { label: "Stream indisponível", tone: "error" },
};

/** Cabeçalho fixo: onde estou e, em qualquer tela, como está a conexão com o hub. */
export function Topbar({ linkState, onRefresh, pendingAckCount, sessionId, socketState, title }: TopbarProps) {
  const hubStatus = HUB_STATUS[linkState];
  const streamStatus = STREAM_STATUS[socketState];

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Biofeedback Hub</p>
        <h1>{title}</h1>
      </div>
      <div className="topbar-actions">
        <StatusPill tone={hubStatus.tone} label={hubStatus.label} />
        <StatusPill tone={streamStatus.tone} label={streamStatus.label} />
        {pendingAckCount > 0 && (
          <StatusPill
            icon={<Bell aria-hidden size={12} />}
            tone="warn"
            label={pendingAckCount === 1 ? "1 ACK pendente" : `${pendingAckCount} ACKs pendentes`}
          />
        )}
        {sessionId && (
          <span className="session-id" title="Sessão atual do hub">
            sessão {sessionId}
          </span>
        )}
        <IconButton label="Atualizar status agora" onClick={onRefresh}>
          <RefreshCw aria-hidden size={16} />
        </IconButton>
      </div>
    </header>
  );
}
