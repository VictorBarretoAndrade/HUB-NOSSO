import { Building2, Code2, GraduationCap, Sparkles } from "lucide-react";
import { Panel } from "../../components/Panel";

interface TeamMember {
  name: string;
  role?: string;
  initials: string;
}

const CIMATEC_ADVISORS: TeamMember[] = [
  {
    name: "Prof. Dr. Márcio Renê Brandão Soussa",
    role: "Orientador de Execução Técnica",
    initials: "MS",
  },
  {
    name: "Prof. Dr. Guilherme Oliveira de Souza",
    role: "Orientador de Gestão de Projeto e Coordenador da Trilha Profissional",
    initials: "GS",
  },
  {
    name: "Prof. Dr. Michell Thompson Ferreira Santiago",
    role: "Orientador de Gestão de Projeto e Coordenador da Trilha Profissional",
    initials: "MT",
  },
];

const CIMATEC_DEVELOPERS: TeamMember[] = [
  {
    name: "Henrique Barros Araújo Correia",
    initials: "HC",
  },
  {
    name: "Juliana Barretto Vilas Boas",
    initials: "JB",
  },
  {
    name: "Rafael de Sales Cezimbra Rodrigues",
    initials: "RR",
  },
  {
    name: "Victor Barreto Andrade Goncalves",
    initials: "VG",
  },
  {
    name: "Yasmin Queiroz Jorge da Silva",
    initials: "YS",
  },
];

const INCITE_REPRESENTATIVES: TeamMember[] = [
  {
    name: "Prof Dra. Ingrid Winkler",
    role: "Coordenadora e representante do laboratório INCITE",
    initials: "IW",
  },
  {
    name: "Yasmin Thasla",
    initials: "YT",
  },
];

const INCITE_DEVELOPERS: TeamMember[] = [
  {
    name: "Lucas Santos Lima",
    initials: "LL",
  },
  {
    name: "Lucas Gregory Gomes Almeida",
    initials: "LG",
  },
];

function MemberCard({ member }: { member: TeamMember }) {
  return (
    <li className="credits-member-card">
      <div className="credits-avatar" aria-hidden="true">
        {member.initials}
      </div>
      <div className="credits-member-info">
        <h4 className="credits-member-name">{member.name}</h4>
        {member.role && <p className="credits-member-role">{member.role}</p>}
      </div>
    </li>
  );
}

export function CreditsView() {
  return (
    <section className="content-grid">
      {/* Hero institucional com logos e texto obrigatório */}
      <section className="panel overview-wide">
        <div className="credits-hero">
          <div className="credits-logos-banner">
            <div className="credits-logo-card">
              <img
                src="/cimatec-logo.jpg"
                alt="Logo Universidade SENAI CIMATEC"
                className="credits-logo-img"
              />
            </div>
            <div className="credits-logo-card">
              <img
                src="/incite-logo.png"
                alt="Logo INCITE Indústria 5.0"
                className="credits-logo-img"
              />
            </div>
          </div>

          <div className="credits-hero-content">
            <h2>Créditos do Projeto DataTraceVR</h2>
          </div>

          <p className="credits-statement-normal">
            O sistema DataTraceVR é resultado de um projeto desenvolvido pelo HIIVE Lab estudantes do curso
            de Engenharia de Computação da Universidade SENAI CIMATEC, no âmbito da Trilha Técnico-Gestor.
          </p>
        </div>
      </section>

      {/* Grade com HIIVE Lab / INCITE e Equipe Técnico Gestor */}
      <div className="credits-grid overview-wide">
        {/* Painel HIIVE Lab / INCITE */}
        <Panel title="HIIVE Lab / INCITE Indústria 5.0">
          {/* Representante */}
          <div className="credits-section-header">
            <div className="credits-section-icon">
              <Building2 aria-hidden size={18} />
            </div>
            <div>
              <h3 className="credits-section-title">Coordenação HIIVE Lab</h3>
            </div>
          </div>
          <ul className="credits-list">
            {INCITE_REPRESENTATIVES.map((rep) => (
              <MemberCard key={rep.name} member={rep} />
            ))}
          </ul>

          {/* Desenvolvedores INCITE */}
          <div className="credits-section-header" style={{ marginTop: 20 }}>
            <div className="credits-section-icon">
              <Sparkles aria-hidden size={18} />
            </div>
            <div>
              <h3 className="credits-section-title">Desenvolvedores do Laboratório INCITE</h3>
              <p className="credits-section-sub">Equipe técnica de desenvolvimento da INCITE</p>
            </div>
          </div>
          <ul className="credits-list">
            {INCITE_DEVELOPERS.map((dev) => (
              <MemberCard key={dev.name} member={dev} />
            ))}
          </ul>
        </Panel>

        {/* Painel Equipe Técnico Gestor */}
        <Panel title="Equipe Técnico Gestor">
          {/* Orientação */}
          <div className="credits-section-header">
            <div className="credits-section-icon">
              <GraduationCap aria-hidden size={18} />
            </div>
            <div>
              <h3 className="credits-section-title">Orientação e Coordenação</h3>
              <p className="credits-section-sub">Docentes e coordenadores responsáveis pelo projeto</p>
            </div>
          </div>
          <ul className="credits-list">
            {CIMATEC_ADVISORS.map((advisor) => (
              <MemberCard key={advisor.name} member={advisor} />
            ))}
          </ul>

          {/* Equipe de estudantes */}
          <div className="credits-section-header" style={{ marginTop: 20 }}>
            <div className="credits-section-icon">
              <Code2 aria-hidden size={18} />
            </div>
            <div>
              <h3 className="credits-section-title">Desenvolvedores e Equipe do Projeto</h3>
              <p className="credits-section-sub">
                Equipe Técnico Gestor · SENAI CIMATEC
              </p>
            </div>
          </div>
          <ul className="credits-list">
            {CIMATEC_DEVELOPERS.map((dev) => (
              <MemberCard key={dev.name} member={dev} />
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  );
}
