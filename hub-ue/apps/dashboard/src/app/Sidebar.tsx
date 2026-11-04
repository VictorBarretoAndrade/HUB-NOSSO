import { NAV_GROUPS } from "./navigation";
import type { View } from "./navigation";

interface SidebarProps {
  activeView: View;
  /** Endereço do hub em uso, sempre visível para o operador saber a que está conectado. */
  hubEndpoint: string;
  onNavigate: (view: View) => void;
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

export function Sidebar({ activeView, hubEndpoint, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <img src="/logo.png" alt="Logo Biofeedback Hub" className="brand-logo" />
        <div className="brand-copy">
          <p className="product-mark">Biofeedback Hub</p>
          <p className="operator-id" title={`Hub em ${hubEndpoint}`}>
            hub {endpointHost(hubEndpoint)}
          </p>
        </div>
      </div>
      <nav className="nav-list" aria-label="Seções do dashboard">
        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            {group.items.map((item) => (
              <button
                aria-current={activeView === item.id ? "page" : undefined}
                className={`nav-button ${activeView === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={item.description}
                type="button"
              >
                <item.icon aria-hidden size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
