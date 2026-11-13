import { Activity, Award, BookOpen, ClipboardCheck, Command, Database, FileText, Gauge, Settings, UserPlus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SessionControlTab } from "../domain/sessionControlUi";
import type { SurveyInstrumentId, SurveyLanguage } from "../domain/surveyInstruments";

export type View =
  | "overview"
  | "subject"
  | "recording"
  | "session"
  | "live"
  | "surveys"
  | "clients"
  | "topics"
  | "diagnostics"
  | "guide"
  | "credits";

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
      {
        id: "surveys",
        label: "Pesquisa",
        title: "Formulários de pesquisa (SELECT-IVE)",
        description: "Aplicação e análise unificada de SUS, IPQ, CSQ-VR, UTAUT2 e Análise de Sentimento com sensores.",
        icon: ClipboardCheck,
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
      {
        id: "credits",
        label: "Créditos",
        title: "Créditos do projeto",
        description: "Empresa demandante, coordenação, orientadores e equipe de desenvolvimento.",
        icon: Award,
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

export interface ParticipantSurveyRouteParams {
  recordId: string;
  instrument: SurveyInstrumentId;
  lang: SurveyLanguage;
  csqPre?: boolean;
  objective?: string;
  utility?: string;
  activities?: string;
  studiedActivity?: string;
}

const VALID_INSTRUMENTS: readonly SurveyInstrumentId[] = ["sus", "ipq", "csqVr", "utaut2", "sentiment"];

/** Lê a rota standalone de aplicação de formulário ao sujeito (sem barra lateral). */
export function parseParticipantSurveyHash(hash: string): ParticipantSurveyRouteParams | null {
  const cleaned = hash.replace(/^#\/?/, "");
  const [pathPart, queryPart = ""] = cleaned.split("?");
  if (pathPart !== "survey-form") {
    return null;
  }
  const sp = new URLSearchParams(queryPart);
  const rawInstrument = sp.get("instrument") as SurveyInstrumentId | null;
  const instrument: SurveyInstrumentId =
    rawInstrument && VALID_INSTRUMENTS.includes(rawInstrument) ? rawInstrument : "sus";
  const lang: SurveyLanguage = sp.get("lang") === "en" ? "en" : "pt";
  return {
    recordId: sp.get("recordId") || "",
    instrument,
    lang,
    csqPre: sp.get("csqPre") === "1",
    objective: sp.get("objective") ?? undefined,
    utility: sp.get("utility") ?? undefined,
    activities: sp.get("activities") ?? undefined,
    studiedActivity: sp.get("studiedActivity") ?? undefined,
  };
}

export function formatParticipantSurveyHash(params: ParticipantSurveyRouteParams): string {
  const sp = new URLSearchParams();
  sp.set("recordId", params.recordId);
  sp.set("instrument", params.instrument);
  sp.set("lang", params.lang);
  if (params.csqPre) sp.set("csqPre", "1");
  if (params.objective) sp.set("objective", params.objective);
  if (params.utility) sp.set("utility", params.utility);
  if (params.activities) sp.set("activities", params.activities);
  if (params.studiedActivity) sp.set("studiedActivity", params.studiedActivity);
  return `#/survey-form?${sp.toString()}`;
}
