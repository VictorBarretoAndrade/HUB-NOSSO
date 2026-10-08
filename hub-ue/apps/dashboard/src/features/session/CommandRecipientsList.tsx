import { StatusPill } from "../../components/StatusPill";
import type { HubClient } from "../../domain/types";

/** Quem vai receber os comandos de sessão: deixa explícito o alcance antes do envio. */
export function CommandRecipientsList({ clients }: { clients: HubClient[] }) {
  return (
    <div className="recipient-list">
      <div className="recipient-list-title">Os comandos serão enviados para</div>
      {clients.length > 0 ? (
        clients.map((client) => (
          <article className="recipient-item" key={client.clientId}>
            <div>
              <strong className="mono">{client.clientId}</strong>
              <span>{client.capabilities.join(", ") || "sem capacidades declaradas"}</span>
            </div>
            <StatusPill tone="muted" label={client.role} />
            <span className={client.outboxSize > 0 ? "warn-icon mono" : "mono"}>outbox {client.outboxSize}</span>
          </article>
        ))
      ) : (
        <p className="muted-copy">
          Nenhum cliente inscrito em <span className="mono">unreal.commands</span>. Conecte o Unreal real ou rode{" "}
          <code>npm run dev:demo</code> para habilitar Pausar e Retomar.
        </p>
      )}
    </div>
  );
}
