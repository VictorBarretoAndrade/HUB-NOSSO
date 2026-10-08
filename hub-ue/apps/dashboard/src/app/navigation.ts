import { Activity, BookOpen, Command, Database, FileText, Gauge, Settings, UserPlus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SessionControlTab } from "../domain/sessionControlUi";

export type View =
  | "overview"
  | "subject"
  | "recording"
  | "session"
  | "live"
  | "clients"
  | "topics"
  | "diagnostics"
  | "guide";

export interface NavItem {
  id: View;
  /** Rótulo curto do menu. */
  label: string;
  /** Título exibido no topo da tela. */
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Menu agrupado na ordem do fluxo de uma sessão: preparar, operar, monitorar. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Início",
    items: [
      {
        id: "overview",
        label: "Visão geral",
        title: "Visão geral",
        description: "Saúde do sistema, prontidão, sensores e eventos recentes.",
        icon: Gauge,
      },
    ],
  },
  {
    label: "Preparar",
    items: [
      {
        id: "subject",
        label: "Sujeito",
        title: "Cadastro do sujeito",
        description: "Cadastro pseudônimo, fatores que afetam a HRV e consentimento.",
        icon: UserPlus,
      },
      {
        id: "recording",
        label: "Gravação",
        title: "Modo de gravação",
        description: "Modo de gravação e seleção de sensores e sinais.",
        icon: Database,
      },
    ],
  },
  {
    label: "Operar",
    items: [
      {
        id: "session",
        label: "Controle da sessão",
        title: "Controle da sessão",
        description: "Iniciar e encerrar, markers, timeline, comandos e relatório.",
        icon: Command,
      },
      {
        id: "live",
        label: "Ao vivo",
        title: "Monitor ao vivo",
        description: "ECG ao vivo e tendências de HR e RR.",
        icon: Activity,
      },
    ],
  },
  {
    label: "Monitorar",
    items: [
      {
        id: "clients",
        label: "Clientes",
        title: "Clientes conectados",
        description: "Clientes conectados ao hub, por papel.",
        icon: Users,
      },
      {
        id: "topics",
        label: "Tópicos",
        title: "Stream de tópicos",
        description: "Eventos ao vivo por tópico, com filtro e inspeção de payload.",
        icon: FileText,
      },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        id: "diagnostics",
        label: "Diagnóstico",
        title: "Diagnóstico do sistema",
        description: "Endereço e token do hub, saúde e status.",
        icon: Settings,
      },
      {
        id: "guide",
        label: "Guia de uso",
        title: "Guia de uso",
        description: "Passo a passo de uma sessão e o papel de cada tela.",
        icon: BookOpen,
      },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export const DEFAULT_VIEW: View = "overview";

const SESSION_TABS: readonly SessionControlTab[] = ["operate", "timeline", "sensors", "history", "report"];

export interface Route {
  view: View;
  /** Aba interna do Controle da sessão, quando presente na URL. */
  sessionTab?: SessionControlTab;
}

export function navItem(view: View): NavItem {
  return NAV_ITEMS.find((item) => item.id === view) ?? NAV_ITEMS[0];
}

/** Lê uma rota a partir do hash da URL (ex.: "#/session/report"). */
export function parseRoute(hash: string): Route {
  const [viewSegment, tabSegment] = hash.replace(/^#\/?/, "").split("/");
  const item = NAV_ITEMS.find((candidate) => candidate.id === viewSegment);
  if (!item) {
    return { view: DEFAULT_VIEW };
  }
  const sessionTab = item.id === "session" ? SESSION_TABS.find((tab) => tab === tabSegment) : undefined;
  return sessionTab ? { view: item.id, sessionTab } : { view: item.id };
}

export function formatRoute(route: Route): string {
  return route.view === "session" && route.sessionTab ? `#/${route.view}/${route.sessionTab}` : `#/${route.view}`;
}
