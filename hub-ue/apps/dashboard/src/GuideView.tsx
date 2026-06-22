// Guia de uso embutido no dashboard.
//
// Página estática (sem estado) que explica o fluxo das 4 features e o papel de
// cada aba. Os botões "Abrir" navegam direto para a aba correspondente via
// onNavigate — o App mantém o estado de navegação.

import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Command,
  Database,
  Download,
  FileText,
  Gauge,
  Lightbulb,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import type { View } from "./App";

type GuideStep = {
  index: number;
  view: View;
  icon: typeof Gauge;
  title: string;
  lead: string;
  points: string[];
  actionLabel: string;
};

const STEPS: GuideStep[] = [
  {
    index: 1,
    view: "subject",
    icon: UserPlus,
    title: "Cadastrar o sujeito",
    lead: "Registre quem será monitorado e o consentimento antes de começar.",
    points: [
      "Use um Subject ID pseudônimo (ex.: S-2026-014) — nunca dados pessoais reais.",
      "Preencha demografia e os fatores que afetam a HRV (cafeína, sono, estresse).",
      "Marque o consentimento. O selo muda para “Pronto para iniciar”.",
    ],
    actionLabel: "Abrir Subject",
  },
  {
    index: 2,
    view: "recording",
    icon: Database,
    title: "Configurar a gravação",
    lead: "Escolha como os sinais serão transmitidos e/ou gravados.",
    points: [
      "Modo: Stream-only (só ao vivo), Record (grava) ou Hybrid (os dois).",
      "Marque os sinais por sensor (ECG / RR / HR).",
      "Opcional: capturar o ECG bruto em arquivo.",
    ],
    actionLabel: "Abrir Recording",
  },
  {
    index: 3,
    view: "session",
    icon: Command,
    title: "Iniciar a experiência",
    lead: "Comece a sessão e acompanhe markers, timeline e comandos.",
    points: [
      "Em Session Control, clique em “Start experience”.",
      "Adicione markers para sinalizar eventos importantes na timeline.",
      "Pause/Resume e o relatório ficam disponíveis durante a sessão.",
    ],
    actionLabel: "Abrir Session Control",
  },
  {
    index: 4,
    view: "live",
    icon: Activity,
    title: "Ver ao vivo",
    lead: "Acompanhe o ECG e as métricas em tempo real enquanto a sessão roda.",
    points: [
      "A aba Live mostra a waveform de ECG no canvas (com o sim em modo hrv-ecg).",
      "BPM e RR atuais, mais as tendências de HR e RR.",
      "Sem ECG no sinal? O painel fica vazio, mas HR/RR continuam.",
    ],
    actionLabel: "Abrir Live",
  },
  {
    index: 5,
    view: "session",
    icon: Download,
    title: "Encerrar e exportar",
    lead: "Finalize a sessão e gere o relatório e os exports.",
    points: [
      "Clique em “End experience” para encerrar e abrir o Report.",
      "Exporte o relatório/timeline em JSON ou CSV direto pela tela.",
      "Para .npy / .mat use o export CLI no terminal (lê o log do hub).",
    ],
    actionLabel: "Abrir Report",
  },
];

const TABS: Array<{ view: View; icon: typeof Gauge; label: string; description: string }> = [
  { view: "overview", icon: Gauge, label: "Overview", description: "Saúde do sistema, prontidão, sensores e eventos recentes." },
  { view: "live", icon: Activity, label: "Live", description: "ECG ao vivo no canvas + HR/RR e tendências." },
  { view: "subject", icon: UserPlus, label: "Subject", description: "Cadastro do sujeito, confundidores e consentimento." },
  { view: "recording", icon: Database, label: "Recording", description: "Modo de gravação e seleção de sensores/sinais." },
  { view: "session", icon: Command, label: "Session Control", description: "Start/End, markers, timeline, comandos e Report/exports." },
  { view: "clients", icon: Users, label: "Clients", description: "Clientes conectados ao hub, por papel (role)." },
  { view: "topics", icon: FileText, label: "Topics", description: "Stream ao vivo de eventos por tópico, com filtro." },
  { view: "diagnostics", icon: Settings, label: "Diagnostics", description: "Endpoint/token do hub e health/status crus." },
];

const SIGNAL_LEGEND: Array<{ tone: "ok" | "warn" | "error" | "muted"; label: string; meaning: string }> = [
  { tone: "ok", label: "Streaming", meaning: "Amostra recente e válida chegando do sensor." },
  { tone: "warn", label: "Stale", meaning: "Sem amostras há mais de 5 s — o sensor parou ou perdeu contato." },
  { tone: "error", label: "Poor signal", meaning: "Sinal ruim (hrStatus < 0) — contato fraco da cinta/eletrodos." },
  { tone: "muted", label: "No samples yet", meaning: "Ainda sem amostras — aguardando o primeiro pacote." },
];

export function GuideView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <section className="content-grid">
      <section className="panel overview-wide">
        <div className="panel-body guide-hero">
          <span className="eyebrow">Guia de uso</span>
          <h2>Como usar o Biofeedback Hub</h2>
          <p className="guide-lead">
            A plataforma coleta sinais fisiológicos (ECG/HRV) de um sensor, distribui pelo hub central e
            mostra tudo aqui no dashboard. O caminho completo são 5 passos — cadastrar o sujeito,
            configurar a gravação, iniciar a experiência, ver ao vivo e exportar. Siga os cartões abaixo.
          </p>
          <div className="guide-actions">
            <button className="command-button strong" type="button" onClick={() => onNavigate("subject")}>
              Começar pelo Subject <ArrowRight size={16} />
            </button>
            <button className="command-button" type="button" onClick={() => onNavigate("overview")}>
              Ir para o Overview <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <section className="panel overview-wide">
        <header className="panel-header">
          <span>Fluxo passo a passo</span>
          <span className="status-pill muted">5 passos</span>
        </header>
        <div className="panel-body">
          <div className="guide-steps">
            {STEPS.map((step) => (
              <article className="guide-step" key={`${step.index}-${step.view}`}>
                <div className="guide-step-top">
                  <span className="guide-step-index">{step.index}</span>
                  <step.icon size={18} className="guide-step-icon" />
                  <h3>{step.title}</h3>
                </div>
                <p className="guide-step-lead">{step.lead}</p>
                <ul className="guide-point-list">
                  {step.points.map((point) => (
                    <li key={point}>
                      <CheckCircle2 size={15} className="guide-point-icon" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <button className="mini-button strong" type="button" onClick={() => onNavigate(step.view)}>
                  {step.actionLabel} <ArrowRight size={14} />
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>O que cada aba faz</span>
        </header>
        <div className="panel-body">
          <div className="guide-tab-list">
            {TABS.map((tab) => (
              <button
                className="guide-tab-row"
                key={tab.view}
                type="button"
                onClick={() => onNavigate(tab.view)}
              >
                <span className="guide-tab-icon">
                  <tab.icon size={18} />
                </span>
                <span className="guide-tab-copy">
                  <strong>{tab.label}</strong>
                  <span>{tab.description}</span>
                </span>
                <ArrowRight size={16} className="guide-tab-arrow" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>Estado do sinal do sensor</span>
        </header>
        <div className="panel-body">
          <p className="muted-copy guide-section-note">
            O selo colorido no card “Sensor readiness” (Overview) indica a saúde do sinal:
          </p>
          <ul className="guide-legend">
            {SIGNAL_LEGEND.map((item) => (
              <li className="guide-legend-item" key={item.label}>
                <span className={`status-pill ${item.tone}`}>{item.label}</span>
                <span className="guide-legend-meaning">{item.meaning}</span>
              </li>
            ))}
          </ul>

          <div className="guide-tip">
            <Lightbulb size={18} className="guide-tip-icon" />
            <div>
              <strong>Sem hardware?</strong>
              <p className="muted-copy">
                Rode o simulador no terminal com <code>biofeedback-sim --mode hrv-ecg</code> para gerar ECG
                sintético. O modo <code>hrv</code> envia só HR/RR (sem waveform na aba Live).
              </p>
            </div>
          </div>

          <div className="guide-tip">
            <Download size={18} className="guide-tip-icon" />
            <div>
              <strong>Exportar .npy / .mat</strong>
              <p className="muted-copy">
                A exportação binária é feita pelo CLI no <code>polarh10_driver</code>, lendo o log do hub:
                <br />
                <code>python -m tools.export_cli --session &lt;sessionId&gt; --signal ecg --format npy --out ecg.npy</code>
              </p>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
