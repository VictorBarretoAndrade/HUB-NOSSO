import { TriangleAlert } from "lucide-react";
import type { SocketState } from "../domain/types";
import type { HubLinkState } from "./hooks/useHubStatus";

interface ConnectionBannerProps {
  linkState: HubLinkState;
  socketState: SocketState;
  hubError: string | null;
  socketError: string | null;
  onRetry: () => void;
  onOpenDiagnostics: () => void;
}

/**
 * Aviso global de conexão: aparece em qualquer tela quando o hub ou o stream caem,
 * dizendo o que aconteceu e oferecendo o próximo passo.
 */
export function ConnectionBanner({
  hubError,
  linkState,
  onOpenDiagnostics,
  onRetry,
  socketError,
  socketState,
}: ConnectionBannerProps) {
  const hubIsDown = linkState === "offline";
  const streamIsDown = linkState === "online" && (socketState === "reconnecting" || socketState === "error");
  if (!hubIsDown && !streamIsDown) {
    return null;
  }

  const message = hubIsDown
    ? (hubError ?? "O hub não está respondendo.")
    : (socketError ?? "A conexão em tempo real com o hub foi perdida.");

  return (
    <div className={`connection-banner ${hubIsDown ? "error" : "warn"}`} role="alert">
      <TriangleAlert aria-hidden size={18} />
      <div className="connection-banner-copy">
        <strong>{hubIsDown ? "Hub offline" : "Stream em tempo real interrompido"}</strong>
        <span>{message}</span>
      </div>
      <div className="connection-banner-actions">
        <button className="mini-button" type="button" onClick={onRetry}>
          Tentar agora
        </button>
        <button className="mini-button" type="button" onClick={onOpenDiagnostics}>
          Abrir Diagnóstico
        </button>
      </div>
    </div>
  );
}
