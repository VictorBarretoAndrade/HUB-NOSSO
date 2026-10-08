import { Activity, ArrowRight, CheckCircle2, Command, Database, Download, Lightbulb, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NAV_ITEMS } from "../../app/navigation";
import type { View } from "../../app/navigation";
import { Panel } from "../../components/Panel";
import { StatusPill } from "../../components/StatusPill";
import type { StatusTone } from "../../components/StatusPill";

interface GuideStep {
  view: View;
  icon: LucideIcon;
  title: string;
  lead: string;
  points: string[];
  actionLabel: string;
}

const STEPS: GuideStep[] = [
  {
    view: "subject",
    icon: UserPlus,
    title: "Cadastrar o sujeito",
    lead: "Registre quem será monitorado e o consentimento antes de começar.",
    points: [
      "Use um Subject ID pseudônimo (ex.: S-2026-014), nunca dados pessoais reais.",
      "Preencha a demografia e os fatores que afetam a HRV (cafeína, sono, estresse).",
      "Marque o consentimento. O selo muda para “Pronto para iniciar”.",
    ],
    actionLabel: "Abrir Sujeito",
  },
  {
    view: "recording",
    icon: Database,
    title: "Configurar a gravação",
    lead: "Escolha como os sinais serão transmitidos e gravados.",
    points: [
      "Modo: só transmitir, gravar ou híbrido (os dois).",
      "Marque os sinais por sensor (ECG, RR, HR, HRV).",
      "Opcional: capturar o ECG bruto em arquivo.",
    ],
    actionLabel: "Abrir Gravação",
  },
  {
    view: "session",
    icon: Command,
    title: "Iniciar a experiência",
    lead: "Comece a sessão e acompanhe markers, timeline e comandos.",
    points: [
      "Em Controle da sessão, clique em “Iniciar experiência”.",
      "Adicione markers para sinalizar eventos importantes na timeline.",
      "Pausar e retomar ficam disponíveis com um cliente Unreal conectado.",
    ],
    actionLabel: "Abrir Controle da sessão",
  },
  {
    view: "live",
    icon: Activity,
    title: "Acompanhar ao vivo",
    lead: "Veja o ECG e as métricas em tempo real enquanto a sessão roda.",
    points: [
      "A tela Ao vivo mostra a waveform de ECG (com o simulador em modo hrv-ecg).",
      "BPM e RR atuais, mais as tendências de HR e RR.",
      "Sem ECG no sinal? O gráfico fica vazio, mas HR e RR continuam.",
    ],
    actionLabel: "Abrir Ao vivo",
  },
  {
    view: "session",
    icon: Download,
    title: "Encerrar e exportar",
    lead: "Finalize a sessão e gere o relatório e os arquivos.",
    points: [
      "Clique em “Encerrar experiência”: o Relatório abre sozinho.",
      "Exporte o relatório e a timeline em JSON ou CSV direto pela tela.",
      "Exporte antes de iniciar a próxima experiência: o relatório anterior é substituído.",
    ],
    actionLabel: "Abrir Controle da sessão",
  },
];

const SIGNAL_LEGEND: Array<{ tone: StatusTone; label: string; meaning: string }> = [
  { tone: "ok", label: "Transmitindo", meaning: "Amostra recente e válida chegando do sensor." },
  { tone: "warn", label: "Sem atualização", meaning: "Sem amostras há mais de 5 s: o sensor parou ou perdeu contato." },
  { tone: "error", label: "Sinal ruim", meaning: "Contato fraco da cinta ou dos eletrodos." },
  { tone: "muted", label: "Sem amostras", meaning: "Ainda aguardando o primeiro pacote do sensor." },
];

/** Ajuda embutida: o fluxo de uma sessão, o papel de cada tela e o significado dos selos. */
export function GuideView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <section className="content-grid">
      <section className="panel overview-wide">
        <div className="panel-body guide-hero">
          <span className="eyebrow">Guia de uso</span>
          <h2>Como usar o Biofeedback Hub</h2>
          <p className="guide-lead">
            A plataforma coleta sinais fisiológicos (ECG/HRV) de um sensor, distribui pelo hub central e mostra tudo
            aqui no dashboard. O caminho completo tem 5 passos: cadastrar o sujeito, configurar a gravação, iniciar a
            experiência, acompanhar ao vivo e exportar.
          </p>
          <div className="guide-actions">
            <button className="command-button strong" type="button" onClick={() => onNavigate("subject")}>
              Começar pelo Sujeito <ArrowRight aria-hidden size={16} />
            </button>
            <button className="command-button" type="button" onClick={() => onNavigate("overview")}>
              Ir para a Visão geral <ArrowRight aria-hidden size={16} />
            </button>
          </div>
        </div>
      </section>

      <Panel
        className="overview-wide"
        title="Fluxo passo a passo"
        action={<StatusPill tone="muted" label={`${STEPS.length} passos`} />}
      >
        <ol className="guide-steps">
          {STEPS.map((step, index) => (
            <li className="guide-step" key={step.title}>
              <div className="guide-step-top">
                <span className="guide-step-index" aria-hidden>
                  {index + 1}
                </span>
                <step.icon aria-hidden size={18} className="guide-step-icon" />
                <h3>{step.title}</h3>
              </div>
              <p className="guide-step-lead">{step.lead}</p>
              <ul className="guide-point-list">
                {step.points.map((point) => (
                  <li key={point}>
                    <CheckCircle2 aria-hidden size={15} className="guide-point-icon" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <button className="mini-button strong" type="button" onClick={() => onNavigate(step.view)}>
                {step.actionLabel} <ArrowRight aria-hidden size={14} />
              </button>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="O que cada tela faz">
        <div className="guide-tab-list">
          {NAV_ITEMS.filter((item) => item.id !== "guide").map((item) => (
            <button className="guide-tab-row" key={item.id} type="button" onClick={() => onNavigate(item.id)}>
              <span className="guide-tab-icon">
                <item.icon aria-hidden size={18} />
              </span>
              <span className="guide-tab-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </span>
              <ArrowRight aria-hidden size={16} className="guide-tab-arrow" />
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Estado do sinal do sensor">
        <p className="muted-copy guide-section-note">
          O selo colorido em “Prontidão do sensor” (Visão geral) indica a saúde do sinal:
        </p>
        <ul className="guide-legend">
          {SIGNAL_LEGEND.map((item) => (
            <li className="guide-legend-item" key={item.label}>
              <StatusPill tone={item.tone} label={item.label} />
              <span className="guide-legend-meaning">{item.meaning}</span>
            </li>
          ))}
        </ul>

        <div className="guide-tip">
          <Lightbulb aria-hidden size={18} className="guide-tip-icon" />
          <div>
            <strong>Sem hardware?</strong>
            <p className="muted-copy">
              Rode o simulador no terminal com <code>biofeedback-sim --mode hrv-ecg</code> para gerar ECG sintético. O
              modo <code>hrv</code> envia só HR/RR (sem waveform na tela Ao vivo).
            </p>
          </div>
        </div>

        <div className="guide-tip">
          <Download aria-hidden size={18} className="guide-tip-icon" />
          <div>
            <strong>Exportar .npy / .mat</strong>
            <p className="muted-copy">
              A exportação binária é feita pelo CLI do <code>polarh10_driver</code>, lendo o log do hub:
              <br />
              <code>python -m tools.export_cli --session &lt;sessionId&gt; --signal ecg --format npy --out ecg.npy</code>
            </p>
          </div>
        </div>
      </Panel>
    </section>
  );
}
