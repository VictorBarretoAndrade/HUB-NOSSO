import { Download } from "lucide-react";
import { useId, useState } from "react";
import type { FormEvent } from "react";
import type { HubSettings } from "../../app/hooks/useHubSettings";
import type { HubLinkState } from "../../app/hooks/useHubStatus";
import type { Notify } from "../../app/hooks/useToasts";
import { KeyValue } from "../../components/KeyValue";
import { Metric } from "../../components/Metric";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type { StatusTone } from "../../components/StatusPill";
import { DEFAULT_HUB_ENDPOINT, toWebSocketEndpoint, validateHubEndpoint } from "../../domain/api";
import { TOPICS } from "../../domain/topics";
import type { HealthResponse, SocketState, StatusResponse } from "../../domain/types";
import { downloadTextFile, fileTimestamp } from "../../lib/download";

const HUB_PILL: Record<HubLinkState, { label: string; tone: StatusTone }> = {
  loading: { label: "Verificando…", tone: "muted" },
  online: { label: "Hub online", tone: "ok" },
  offline: { label: "Hub offline", tone: "error" },
};

const SOCKET_LABEL: Record<SocketState, string> = {
  idle: "inativo",
  connecting: "conectando",
  connected: "conectado",
  reconnecting: "reconectando",
  error: "indisponível",
};

interface DiagnosticsViewProps {
  health: HealthResponse | null;
  hubError: string | null;
  linkState: HubLinkState;
  notify: Notify;
  settings: HubSettings;
  socketState: SocketState;
  status: StatusResponse | null;
}

export function DiagnosticsView({ health, hubError, linkState, notify, settings, socketState, status }: DiagnosticsViewProps) {
  // A configuração só passa a valer ao aplicar: digitar não reconecta nem derruba a sessão.
  const [draftEndpoint, setDraftEndpoint] = useState(settings.endpoint);
  const [draftToken, setDraftToken] = useState(settings.token);
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const endpointId = useId();
  const tokenId = useId();
  const endpointErrorId = useId();

  const hasChanges = draftEndpoint.trim() !== settings.endpoint || draftToken.trim() !== settings.token;
  const hubPill = HUB_PILL[linkState];

  const applySettings = (event: FormEvent) => {
    event.preventDefault();
    const validation = validateHubEndpoint(draftEndpoint);
    if (!validation.ok) {
      setEndpointError(validation.message);
      return;
    }
    setEndpointError(null);
    setDraftEndpoint(validation.endpoint);
    setDraftToken(draftToken.trim());
    settings.apply({ endpoint: validation.endpoint, token: draftToken.trim() });
    notify("Configuração de rede aplicada. Reconectando ao hub.");
  };

  const discardChanges = () => {
    setDraftEndpoint(settings.endpoint);
    setDraftToken(settings.token);
    setEndpointError(null);
  };

  const restoreDefault = () => {
    setDraftEndpoint(DEFAULT_HUB_ENDPOINT);
    setEndpointError(null);
  };

  const exportDiagnostics = () => {
    const exportedAt = new Date().toISOString();
    const filename = `biofeedback-diagnostico-${fileTimestamp(exportedAt)}.json`;
    // O token nunca entra no arquivo: ele pode ser compartilhado para suporte.
    const snapshot = { exportedAt, endpoint: settings.endpoint, socketState, hubError, health, status };
    downloadTextFile(filename, JSON.stringify(snapshot, null, 2), "application/json");
    notify(`Arquivo ${filename} exportado.`);
  };

  return (
    <section className="content-grid diagnostics-grid">
      <Panel title="Saúde do sistema" action={<StatusPill tone={hubPill.tone} label={hubPill.label} />}>
        <div className="table-scroll">
          <table className="data-table">
            <tbody>
              <KeyValue label="/health" value={linkState === "loading" ? "verificando" : health?.ok ? "ok" : "offline"} />
              <KeyValue label="service" value={health?.service ?? "--"} />
              <KeyValue label="sessionId" value={health?.sessionId ?? "--"} />
              <KeyValue label="pendingAckCount" value={String(status?.pendingAckCount ?? health?.pendingAcks ?? 0)} />
              <KeyValue label="websocket" value={SOCKET_LABEL[socketState]} />
            </tbody>
          </table>
        </div>
        {hubError && (
          <p className="alert-line inline" role="status">
            {hubError}
          </p>
        )}
      </Panel>

      <Panel title="Configuração de rede">
        <form className="form-block" noValidate onSubmit={applySettings}>
          <label htmlFor={endpointId}>Endereço do hub</label>
          <input
            aria-describedby={endpointError ? endpointErrorId : undefined}
            aria-invalid={endpointError ? true : undefined}
            autoComplete="off"
            id={endpointId}
            inputMode="url"
            placeholder={DEFAULT_HUB_ENDPOINT}
            spellCheck={false}
            value={draftEndpoint}
            onChange={(event) => {
              setDraftEndpoint(event.target.value);
              setEndpointError(null);
            }}
          />
          {endpointError && (
            <p className="field-error" id={endpointErrorId} role="alert">
              {endpointError}
            </p>
          )}

          <label htmlFor={tokenId}>Token de autenticação (opcional)</label>
          <input
            autoComplete="off"
            id={tokenId}
            placeholder="Deixe em branco se o hub não exige token"
            type="password"
            value={draftToken}
            onChange={(event) => setDraftToken(event.target.value)}
          />

          <div className="form-actions">
            <button className="command-button strong" disabled={!hasChanges} type="submit">
              Aplicar
            </button>
            <button className="command-button" disabled={!hasChanges} type="button" onClick={discardChanges}>
              Descartar alterações
            </button>
            <button
              className="command-button"
              disabled={draftEndpoint.trim() === DEFAULT_HUB_ENDPOINT}
              type="button"
              onClick={restoreDefault}
            >
              Restaurar padrão
            </button>
          </div>
          <p className="muted-copy">
            {hasChanges
              ? "Há alterações não aplicadas. A conexão atual continua ativa até você aplicar."
              : "O endereço e o token ficam salvos apenas neste navegador."}
          </p>
          <p className="muted-copy">
            WebSocket em uso: <span className="mono">{toWebSocketEndpoint(settings.endpoint, "")}</span>
          </p>
        </form>
      </Panel>

      <Panel title="Como conectar os clientes">
        <ol className="steps">
          <li>
            Inicie o hub com <code>.\.venv\Scripts\biofeedback-hub</code>.
          </li>
          <li>Aponte o endpoint do Quest Supervisor para esta máquina, porta 8787.</li>
          <li>
            Inicie o Unreal/Quest ou um simulador e confira se ele aparece em <strong>Clientes</strong>.
          </li>
          <li>
            Use <strong>Tópicos</strong> para confirmar as publicações de estado e de sensores.
          </li>
        </ol>
      </Panel>

      <Panel title="Armazenamento e suporte">
        <Metric label="Pasta dos logs de sessão (no hub)" value="data/sessions" small />
        <Metric label="Tópicos conhecidos" value={TOPICS.length} />
        <button className="command-button" type="button" onClick={exportDiagnostics}>
          <Download aria-hidden size={16} /> Exportar diagnóstico (JSON)
        </button>
        <p className="muted-copy">Inclui endereço, saúde e status do hub. O token não é incluído.</p>
      </Panel>
    </section>
  );
}
