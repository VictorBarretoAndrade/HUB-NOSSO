export type SurveyLanguage = "pt" | "en";

export type SurveyInstrumentId = "sus" | "ipq" | "csqVr" | "utaut2" | "sentiment";

export interface BilingualText {
  pt: string;
  en: string;
}

export interface SusItemDefinition {
  index: number;
  id: string;
  positive: boolean;
  text: BilingualText;
}

export type IpqSubscale = "G" | "SP" | "INV" | "REAL";

export interface IpqItemDefinition {
  index: number;
  id: string;
  subscale: IpqSubscale;
  reversed: boolean;
  text: BilingualText;
  anchors?: {
    min: BilingualText;
    max: BilingualText;
  };
}

export type CsqVrCategory = "nausea" | "vestibular" | "oculomotor";

export interface CsqVrItemDefinition {
  id: "nauseaA" | "nauseaB" | "vestibularA" | "vestibularB" | "oculomotorA" | "oculomotorB";
  label: string;
  category: CsqVrCategory;
  categoryLabel: BilingualText;
  text: BilingualText;
}

export type Utaut2ConstructId = "PE" | "EE" | "SI" | "FC" | "HM" | "PV" | "HT" | "BI";

export interface Utaut2ConstructDefinition {
  id: Utaut2ConstructId;
  name: BilingualText;
  description: BilingualText;
}

export interface Utaut2Placeholders {
  objective: string;
  utility: string;
  activities: string;
  studiedActivity: string;
}

export interface Utaut2ItemDefinition {
  id: string;
  construct: Utaut2ConstructId;
  template: BilingualText;
}

export interface SentimentQuestionDefinition {
  id: "feeling" | "engagement" | "distance";
  label: BilingualText;
  prompt: BilingualText;
}

export interface SentimentLikertItemDefinition {
  id: "presence" | "bodyEngagement" | "similarity";
  label: BilingualText;
  text: BilingualText;
}

export const LIKERT_5_LABELS: Record<SurveyLanguage, [string, string, string, string, string]> = {
  pt: ["Discordo totalmente", "Discordo", "Neutro", "Concordo", "Concordo totalmente"],
  en: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
};

export const CSQ_VR_7_LABELS: Record<SurveyLanguage, [string, string, string, string, string, string, string]> = {
  pt: [
    "1 · Ausente",
    "2 · Muito leve",
    "3 · Leve",
    "4 · Moderado",
    "5 · Intenso",
    "6 · Muito intenso",
    "7 · Extremo",
  ],
  en: [
    "1 · Absent feeling",
    "2 · Very mild feeling",
    "3 · Mild feeling",
    "4 · Moderate feeling",
    "5 · Intense feeling",
    "6 · Very intense feeling",
    "7 · Extreme feeling",
  ],
};

export const SURVEY_INSTRUMENT_META: Array<{
  id: SurveyInstrumentId;
  shortLabel: string;
  title: BilingualText;
  construct: BilingualText;
  scaleLabel: BilingualText;
}> = [
  {
    id: "sus",
    shortLabel: "SUS",
    title: {
      pt: "System Usability Scale (SUS)",
      en: "System Usability Scale (SUS)",
    },
    construct: {
      pt: "Usabilidade percebida (0–100)",
      en: "Perceived usability (0–100)",
    },
    scaleLabel: {
      pt: "10 itens · Likert 1–5",
      en: "10 items · Likert 1–5",
    },
  },
  {
    id: "ipq",
    shortLabel: "IPQ",
    title: {
      pt: "Igroup Presence Questionnaire (IPQ)",
      en: "Igroup Presence Questionnaire (IPQ)",
    },
    construct: {
      pt: "Presença espacial, envolvimento e realismo (1–5)",
      en: "Spatial presence, involvement, and realism (1–5)",
    },
    scaleLabel: {
      pt: "14 itens · Likert 1–5",
      en: "14 items · Likert 1–5",
    },
  },
  {
    id: "csqVr",
    shortLabel: "CSQ-VR",
    title: {
      pt: "Cybersickness in Virtual Reality (CSQ-VR)",
      en: "Cybersickness in Virtual Reality (CSQ-VR)",
    },
    construct: {
      pt: "Náusea, sintomas vestibulares e oculomotores (6–42)",
      en: "Nausea, vestibular, and oculomotor symptoms (6–42)",
    },
    scaleLabel: {
      pt: "6 itens · Likert 1–7 (Pré/Pós)",
      en: "6 items · Likert 1–7 (Pre/Post)",
    },
  },
  {
    id: "utaut2",
    shortLabel: "UTAUT2",
    title: {
      pt: "Unified Theory of Acceptance and Use of Technology 2 (UTAUT2)",
      en: "Unified Theory of Acceptance and Use of Technology 2 (UTAUT2)",
    },
    construct: {
      pt: "Aceitação de tecnologia e intenção comportamental (8 construtos)",
      en: "Technology acceptance and behavioral intention (8 constructs)",
    },
    scaleLabel: {
      pt: "27 itens · Likert 1–5",
      en: "27 items · Likert 1–5",
    },
  },
  {
    id: "sentiment",
    shortLabel: "Sentimento",
    title: {
      pt: "Análise de Sentimento Pós-Exposição",
      en: "Post-Exposure Sentiment Analysis",
    },
    construct: {
      pt: "Valência afetiva (VADER + TextBlob PC1) e triangulação Likert",
      en: "Affective valence (VADER + TextBlob PC1) and Likert triangulation",
    },
    scaleLabel: {
      pt: "3 relatos abertos + 3 Likert 1–5",
      en: "3 open reports + 3 Likert 1–5",
    },
  },
];

export const SUS_ITEMS: SusItemDefinition[] = [
  {
    index: 1,
    id: "Q1",
    positive: true,
    text: {
      pt: "Acho que gostaria de usar este sistema com frequência.",
      en: "I think that I would like to use this system frequently.",
    },
  },
  {
    index: 2,
    id: "Q2",
    positive: false,
    text: {
      pt: "Achei o sistema desnecessariamente complexo.",
      en: "I found the system unnecessarily complex.",
    },
  },
  {
    index: 3,
    id: "Q3",
    positive: true,
    text: {
      pt: "Achei o sistema fácil de usar.",
      en: "I thought the system was easy to use.",
    },
  },
  {
    index: 4,
    id: "Q4",
    positive: false,
    text: {
      pt: "Acho que precisaria do apoio de um técnico para conseguir usar este sistema.",
      en: "I think that I would need the support of a technical person to be able to use this system.",
    },
  },
  {
    index: 5,
    id: "Q5",
    positive: true,
    text: {
      pt: "Achei que as diversas funções deste sistema estavam bem integradas.",
      en: "I found the various functions in this system were well integrated.",
    },
  },
  {
    index: 6,
    id: "Q6",
    positive: false,
    text: {
      pt: "Achei que havia muita inconsistência neste sistema.",
      en: "I thought there was too much inconsistency in this system.",
    },
  },
  {
    index: 7,
    id: "Q7",
    positive: true,
    text: {
      pt: "Imagino que a maioria das pessoas aprenderia a usar este sistema muito rapidamente.",
      en: "I would imagine that most people would learn to use this system very quickly.",
    },
  },
  {
    index: 8,
    id: "Q8",
    positive: false,
    text: {
      pt: "Achei o sistema muito incômodo/complicado de usar.",
      en: "I found the system very cumbersome to use.",
    },
  },
  {
    index: 9,
    id: "Q9",
    positive: true,
    text: {
      pt: "Senti-me muito confiante ao usar o sistema.",
      en: "I felt very confident using the system.",
    },
  },
  {
    index: 10,
    id: "Q10",
    positive: false,
    text: {
      pt: "Precisei aprender muitas coisas antes de conseguir começar a usar este sistema.",
      en: "I needed to learn a lot of things before I could get going with this system.",
    },
  },
];

export const IPQ_ITEMS: IpqItemDefinition[] = [
  {
    index: 1,
    id: "G1",
    subscale: "G",
    reversed: false,
    text: {
      pt: "No mundo gerado por computador, tive a sensação de estar lá.",
      en: "In the computer generated world I had a sense of being there.",
    },
  },
  {
    index: 2,
    id: "SP1",
    subscale: "SP",
    reversed: false,
    text: {
      pt: "De alguma forma, senti que o mundo virtual me rodeava.",
      en: "Somehow I felt that the virtual world surrounded me.",
    },
  },
  {
    index: 3,
    id: "SP2",
    subscale: "SP",
    reversed: true,
    text: {
      pt: "Senti como se estivesse apenas percebendo imagens.",
      en: "I felt like I was just perceiving pictures.",
    },
  },
  {
    index: 4,
    id: "SP3",
    subscale: "SP",
    reversed: true,
    text: {
      pt: "Não me senti presente no espaço virtual.",
      en: "I did not feel present in the virtual space.",
    },
  },
  {
    index: 5,
    id: "SP4",
    subscale: "SP",
    reversed: false,
    text: {
      pt: "Tive a sensação de agir dentro do espaço virtual, em vez de operar algo de fora.",
      en: "I had a sense of acting in the virtual space, rather than operating something from outside.",
    },
  },
  {
    index: 6,
    id: "SP5",
    subscale: "SP",
    reversed: false,
    text: {
      pt: "Senti-me presente no espaço virtual.",
      en: "I felt present in the virtual space.",
    },
  },
  {
    index: 7,
    id: "INV1",
    subscale: "INV",
    reversed: true,
    text: {
      pt: "Quão consciente você estava do mundo real ao seu redor enquanto navegava no mundo virtual (ex.: sons, temperatura da sala, outras pessoas)?",
      en: "How aware were you of the real world surrounding you while navigating in the virtual world? (i.e. sounds, room temperature, other people, etc.)?",
    },
  },
  {
    index: 8,
    id: "INV2",
    subscale: "INV",
    reversed: false,
    text: {
      pt: "Não estava consciente do meu ambiente real.",
      en: "I was not aware of my real environment.",
    },
  },
  {
    index: 9,
    id: "INV3",
    subscale: "INV",
    reversed: true,
    text: {
      pt: "Ainda prestei atenção ao ambiente real.",
      en: "I still paid attention to the real environment.",
    },
  },
  {
    index: 10,
    id: "INV4",
    subscale: "INV",
    reversed: false,
    text: {
      pt: "Fiquei completamente cativado(a) pelo mundo virtual.",
      en: "I was completely captivated by the virtual world.",
    },
  },
  {
    index: 11,
    id: "REAL1",
    subscale: "REAL",
    reversed: false,
    text: {
      pt: "Quão real o mundo virtual lhe pareceu?",
      en: "How real did the virtual world seem to you?",
    },
  },
  {
    index: 12,
    id: "REAL2",
    subscale: "REAL",
    reversed: false,
    text: {
      pt: "O quanto a sua experiência no ambiente virtual pareceu consistente com a sua experiência no mundo real?",
      en: "How much did your experience in the virtual environment seem consistent with your real world experience?",
    },
  },
  {
    index: 13,
    id: "REAL3",
    subscale: "REAL",
    reversed: false,
    text: {
      pt: "Quão real o mundo virtual lhe pareceu? (confirmação psicométrica)",
      en: "How real did the virtual world seem to you?",
    },
  },
  {
    index: 14,
    id: "REAL4",
    subscale: "REAL",
    reversed: false,
    text: {
      pt: "O mundo virtual pareceu mais realista do que o mundo real.",
      en: "The virtual world seemed more realistic than the real world.",
    },
  },
];

export const CSQ_VR_ITEMS: CsqVrItemDefinition[] = [
  {
    id: "nauseaA",
    label: "Nausea A",
    category: "nausea",
    categoryLabel: { pt: "Náusea", en: "Nausea" },
    text: {
      pt: "Você sente náusea (ex.: dor de estômago, refluxo ácido ou vontade de vomitar)?",
      en: "Do you experience nausea, e.g., stomach pain, acid reflux, or tension to vomit?",
    },
  },
  {
    id: "nauseaB",
    label: "Nausea B",
    category: "nausea",
    categoryLabel: { pt: "Náusea", en: "Nausea" },
    text: {
      pt: "Você sente tontura (ex.: cabeça leve ou sensação de giro)?",
      en: "Do you experience dizziness, e.g., light-headedness or spinning feeling?",
    },
  },
  {
    id: "vestibularA",
    label: "Vestibular A",
    category: "vestibular",
    categoryLabel: { pt: "Vestibular", en: "Vestibular" },
    text: {
      pt: "Você sente desorientação (ex.: confusão espacial ou vertigem)?",
      en: "Do you experience disorientation, e.g., spatial confusion or vertigo?",
    },
  },
  {
    id: "vestibularB",
    label: "Vestibular B",
    category: "vestibular",
    categoryLabel: { pt: "Vestibular", en: "Vestibular" },
    text: {
      pt: "Você sente instabilidade postural (isto é, desequilíbrio)?",
      en: "Do you experience postural instability, i.e., imbalance?",
    },
  },
  {
    id: "oculomotorA",
    label: "Oculomotor A",
    category: "oculomotor",
    categoryLabel: { pt: "Oculomotor", en: "Oculomotor" },
    text: {
      pt: "Você sente fadiga induzida visualmente (ex.: sensação de cansaço ou sonolência)?",
      en: "Do you experience a visually induced fatigue, e.g., feeling of tiredness or sleepiness?",
    },
  },
  {
    id: "oculomotorB",
    label: "Oculomotor B",
    category: "oculomotor",
    categoryLabel: { pt: "Oculomotor", en: "Oculomotor" },
    text: {
      pt: "Você sente desconforto induzido visualmente (ex.: vista cansada, visão turva ou dor de cabeça)?",
      en: "Do you experience a visually induced discomfort, e.g., eyestrain, blurred vision, or headache?",
    },
  },
];

export const UTAUT2_CONSTRUCTS: Utaut2ConstructDefinition[] = [
  {
    id: "PE",
    name: { pt: "Expectativa de Desempenho (PE)", en: "Performance Expectancy (PE)" },
    description: {
      pt: "Grau em que o indivíduo acredita que usar a tecnologia melhorará seu desempenho.",
      en: "Degree to which an individual believes that using the technology will improve performance.",
    },
  },
  {
    id: "EE",
    name: { pt: "Expectativa de Esforço (EE)", en: "Effort Expectancy (EE)" },
    description: {
      pt: "Grau de facilidade associado ao uso da tecnologia.",
      en: "Degree of ease associated with the use of the technology.",
    },
  },
  {
    id: "SI",
    name: { pt: "Influência Social (SI)", en: "Social Influence (SI)" },
    description: {
      pt: "Grau em que pessoas importantes influenciam a decisão de usar a tecnologia.",
      en: "Degree to which important others influence the individual's decision to use the technology.",
    },
  },
  {
    id: "FC",
    name: { pt: "Condições Facilitadoras (FC)", en: "Facilitating Conditions (FC)" },
    description: {
      pt: "Grau em que recursos e suporte adequados estão disponíveis para o uso.",
      en: "Degree to which adequate resources and support are perceived to be available.",
    },
  },
  {
    id: "HM",
    name: { pt: "Motivação Hedônica (HM)", en: "Hedonic Motivation (HM)" },
    description: {
      pt: "Grau de diversão ou prazer associado ao uso da tecnologia.",
      en: "Degree of enjoyment or pleasure associated with using the technology.",
    },
  },
  {
    id: "PV",
    name: { pt: "Valor percebido / Preço (PV)", en: "Price Value (PV)" },
    description: {
      pt: "Avaliação cognitiva do equilíbrio entre os benefícios percebidos e o esforço/custo investido.",
      en: "Cognitive evaluation of the trade-off between perceived benefits and effort/cost.",
    },
  },
  {
    id: "HT",
    name: { pt: "Hábito (HT)", en: "Habit (HT)" },
    description: {
      pt: "Grau em que o uso da tecnologia se torna automático e recorrente no cotidiano.",
      en: "Degree to which technology use becomes automatic or regular.",
    },
  },
  {
    id: "BI",
    name: { pt: "Intenção Comportamental (BI)", en: "Behavioral Intention (BI)" },
    description: {
      pt: "Disposição individual para continuar utilizando a tecnologia no futuro.",
      en: "Individual willingness to use the technology in the future.",
    },
  },
];

export const DEFAULT_UTAUT2_PLACEHOLDERS: Record<SurveyLanguage, Utaut2Placeholders> = {
  pt: {
    objective: "o treinamento imersivo de segurança",
    utility: "alcançar melhores resultados operacionais",
    activities: "procedimentos técnicos e tomada de decisão",
    studiedActivity: "treinamento profissional em realidade virtual",
  },
  en: {
    objective: "immersive safety training",
    utility: "achieving better operational outcomes",
    activities: "technical procedures and decision-making",
    studiedActivity: "professional virtual reality training",
  },
};

export const UTAUT2_ITEMS: Utaut2ItemDefinition[] = [
  {
    id: "PE1",
    construct: "PE",
    template: {
      pt: "Considero o uso do ambiente virtual imersivo útil para {objective}.",
      en: "I consider the use of the immersive virtual environment useful for {objective}.",
    },
  },
  {
    id: "PE2",
    construct: "PE",
    template: {
      pt: "Usar o ambiente virtual imersivo aumenta minhas chances de {utility}.",
      en: "Using the immersive virtual environment increases my chances of {utility}.",
    },
  },
  {
    id: "PE3",
    construct: "PE",
    template: {
      pt: "O uso do ambiente virtual imersivo me ajuda a realizar atividades relacionadas a {activities}.",
      en: "The use of the immersive virtual environment helps me perform activities related to {activities}.",
    },
  },
  {
    id: "PE4",
    construct: "PE",
    template: {
      pt: "O ambiente virtual imersivo contribui para melhorar meu desempenho em atividades associadas a {activities}.",
      en: "The immersive virtual environment contributes to improving my performance in activities associated with {activities}.",
    },
  },
  {
    id: "EE1",
    construct: "EE",
    template: {
      pt: "Aprender a usar o ambiente virtual imersivo foi fácil para mim.",
      en: "Learning to use the immersive virtual environment was easy for me.",
    },
  },
  {
    id: "EE2",
    construct: "EE",
    template: {
      pt: "Minha interação com o ambiente virtual imersivo foi clara e compreensível.",
      en: "My interaction with the immersive virtual environment was clear and understandable.",
    },
  },
  {
    id: "EE3",
    construct: "EE",
    template: {
      pt: "Considero o ambiente virtual imersivo fácil de usar.",
      en: "I consider the immersive virtual environment easy to use.",
    },
  },
  {
    id: "EE4",
    construct: "EE",
    template: {
      pt: "Tornar-me habilidoso(a) no uso do ambiente virtual imersivo foi fácil para mim.",
      en: "Becoming skilled in using the immersive virtual environment was easy for me.",
    },
  },
  {
    id: "SI1",
    construct: "SI",
    template: {
      pt: "Pessoas importantes para mim considerariam o uso de ambientes virtuais imersivos apropriado para {studiedActivity}.",
      en: "People important to me would consider the use of immersive virtual environments appropriate for {studiedActivity}.",
    },
  },
  {
    id: "SI2",
    construct: "SI",
    template: {
      pt: "Pessoas que influenciam meu comportamento apoiariam o uso deste tipo de ambiente virtual.",
      en: "People who influence my behavior would support the use of this type of virtual environment.",
    },
  },
  {
    id: "SI3",
    construct: "SI",
    template: {
      pt: "Pessoas cujas opiniões eu valorizo achariam positivo que eu utilize este tipo de ambiente virtual.",
      en: "People whose opinions I value would find it positive that I use this type of virtual environment.",
    },
  },
  {
    id: "FC1",
    construct: "FC",
    template: {
      pt: "Tenho os recursos necessários para usar ambientes virtuais imersivos como este.",
      en: "I have the resources necessary to use immersive virtual environments like this one.",
    },
  },
  {
    id: "FC2",
    construct: "FC",
    template: {
      pt: "Tenho o conhecimento necessário para usar ambientes virtuais imersivos.",
      en: "I have the knowledge necessary to use immersive virtual environments.",
    },
  },
  {
    id: "FC3",
    construct: "FC",
    template: {
      pt: "O ambiente virtual imersivo é compatível com outras tecnologias que utilizo.",
      en: "The immersive virtual environment is compatible with other technologies I use.",
    },
  },
  {
    id: "FC4",
    construct: "FC",
    template: {
      pt: "Posso contar com a ajuda de outras pessoas caso encontre dificuldades ao usar o ambiente virtual imersivo.",
      en: "I can rely on help from others if I encounter difficulties using the immersive virtual environment.",
    },
  },
  {
    id: "HM1",
    construct: "HM",
    template: {
      pt: "Usar o ambiente virtual imersivo foi divertido.",
      en: "Using the immersive virtual environment was fun.",
    },
  },
  {
    id: "HM2",
    construct: "HM",
    template: {
      pt: "Usar o ambiente virtual imersivo foi uma experiência agradável.",
      en: "Using the immersive virtual environment was an enjoyable experience.",
    },
  },
  {
    id: "HM3",
    construct: "HM",
    template: {
      pt: "Usar o ambiente virtual imersivo foi prazeroso para mim.",
      en: "Using the immersive virtual environment was pleasurable for me.",
    },
  },
  {
    id: "PV1",
    construct: "PV",
    template: {
      pt: "Considero que o esforço e o tempo investidos no uso deste ambiente virtual imersivo são justificados pelos benefícios proporcionados pela experiência.",
      en: "I consider that the effort and time invested in using this immersive virtual environment are justified by the benefits provided by the experience.",
    },
  },
  {
    id: "PV2",
    construct: "PV",
    template: {
      pt: "Avalio que o ambiente virtual imersivo oferece um bom equilíbrio entre os benefícios percebidos e o esforço exigido para seu uso.",
      en: "I evaluate that the immersive virtual environment offers a good balance between the perceived benefits and the effort required for its use.",
    },
  },
  {
    id: "PV3",
    construct: "PV",
    template: {
      pt: "No geral, o ambiente virtual imersivo apresenta um valor experiencial adequado, considerando os benefícios obtidos em relação às demandas impostas ao usuário.",
      en: "Overall, the immersive virtual environment presents an adequate experiential value, considering the benefits obtained in relation to the demands imposed on the user.",
    },
  },
  {
    id: "HT1",
    construct: "HT",
    template: {
      pt: "Consigo imaginar o uso frequente de ambientes virtuais imersivos como este no meu contexto profissional.",
      en: "I can imagine the frequent use of immersive virtual environments like this in my professional context.",
    },
  },
  {
    id: "HT2",
    construct: "HT",
    template: {
      pt: "Vejo-me utilizando regularmente ambientes virtuais imersivos em atividades relacionadas ao trabalho.",
      en: "I see myself regularly using immersive virtual environments in work-related activities.",
    },
  },
  {
    id: "HT3",
    construct: "HT",
    template: {
      pt: "O uso de ambientes virtuais imersivos poderia se tornar um hábito no meu dia a dia profissional.",
      en: "The use of immersive virtual environments could become a habit in my professional daily life.",
    },
  },
  {
    id: "BI1",
    construct: "BI",
    template: {
      pt: "Pretendo usar ambientes virtuais imersivos semelhantes a este no futuro.",
      en: "I intend to use immersive virtual environments similar to this one in the future.",
    },
  },
  {
    id: "BI2",
    construct: "BI",
    template: {
      pt: "Sempre que possível, buscaria utilizar ambientes virtuais imersivos para atividades relacionadas a {studiedActivity}.",
      en: "Whenever possible, I would seek to use immersive virtual environments for activities related to {studiedActivity}.",
    },
  },
  {
    id: "BI3",
    construct: "BI",
    template: {
      pt: "Pretendo utilizar frequentemente ambientes virtuais imersivos em contextos profissionais.",
      en: "I intend to frequently use immersive virtual environments in professional contexts.",
    },
  },
];

export function formatUtaut2ItemText(
  item: Utaut2ItemDefinition,
  lang: SurveyLanguage,
  placeholders?: Partial<Utaut2Placeholders>,
): string {
  const defaults = DEFAULT_UTAUT2_PLACEHOLDERS[lang];
  const merged: Utaut2Placeholders = {
    objective: placeholders?.objective?.trim() || defaults.objective,
    utility: placeholders?.utility?.trim() || defaults.utility,
    activities: placeholders?.activities?.trim() || defaults.activities,
    studiedActivity: placeholders?.studiedActivity?.trim() || defaults.studiedActivity,
  };
  return item.template[lang]
    .replace(/\{objective\}/g, merged.objective)
    .replace(/\{utility\}/g, merged.utility)
    .replace(/\{activities\}/g, merged.activities)
    .replace(/\{studiedActivity\}/g, merged.studiedActivity);
}

export const SENTIMENT_INTERVIEW_QUESTIONS: SentimentQuestionDefinition[] = [
  {
    id: "feeling",
    label: { pt: "Sensação na experiência", en: "Feeling of being in the experience" },
    prompt: {
      pt: "1. Qual foi a sua sensação de estar na experiência?",
      en: "1. What was your feeling of being in the experience?",
    },
  },
  {
    id: "engagement",
    label: { pt: "Fatores de engajamento", en: "Aspects that increased engagement" },
    prompt: {
      pt: "2. Quais aspectos fizeram você se envolver mais com a experiência?",
      en: "2. Which aspects made you engage more with the experience?",
    },
  },
  {
    id: "distance",
    label: { pt: "Fatores de distanciamento", en: "Aspects that reduced immersion" },
    prompt: {
      pt: "3. Quais aspectos fizeram você se sentir mais distante ou menos imerso na experiência?",
      en: "3. Which aspects made you feel more distant or less immersed in the experience?",
    },
  },
];

export const SENTIMENT_LIKERT_ITEMS: SentimentLikertItemDefinition[] = [
  {
    id: "presence",
    label: { pt: "Presença percebida", en: "Perceived presence" },
    text: {
      pt: "Até que ponto você sentiu que estava presente em um ambiente real da atividade simulada?",
      en: "To what extent, if at all, did you feel that you were present in a real task environment?",
    },
  },
  {
    id: "bodyEngagement",
    label: { pt: "Engajamento corporal", en: "Bodily engagement" },
    text: {
      pt: "Até que ponto você percebeu seu corpo reagindo ou se ajustando aos desafios da tarefa no ambiente virtual (ex.: cautela nos movimentos, postura ou equilíbrio)?",
      en: "To what extent, if at all, did you perceive your body reacting or adjusting to the challenges of the task in the virtual environment (e.g., caution in movements, posture, or balance)?",
    },
  },
  {
    id: "similarity",
    label: { pt: "Similaridade com o mundo real", en: "Similarity to the real world" },
    text: {
      pt: "Olhando para trás em sua experiência, até que ponto ela se assemelhou à realização da atividade real?",
      en: "Looking back on your experience, to what extent did it resemble performing an actual real-world activity?",
    },
  },
];
