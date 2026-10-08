# Biofeedback Hub Dashboard

Console local (React + Vite + TypeScript) para operar uma sessão de biofeedback: preparar o sujeito e a gravação, controlar a experiência, acompanhar sensores ao vivo e exportar o relatório. A interface é toda em português; nomes do protocolo (`marker`, `ACK`, `payload`, tópicos, papéis) aparecem como trafegam no fio.

## Rodar em desenvolvimento

Na raiz do repositório:

```powershell
npm install
npm run dev:dashboard
```

O Vite abre em `http://127.0.0.1:5173` e o dashboard conecta no hub em `http://127.0.0.1:8787`. O endereço e o token (opcional) são alterados em **Diagnóstico** e ficam salvos apenas no `localStorage` do navegador.

Sem hardware, suba o hub e os simuladores (em terminais separados):

```powershell
.\.venv\Scripts\biofeedback-hub
.\.venv\Scripts\biofeedback-sim --mode hrv-ecg   # sensor com ECG sintético
.\.venv\Scripts\biofeedback-sim --mode unreal    # cliente Unreal simulado
```

## Verificações

| Comando (na raiz) | O que faz |
|---|---|
| `npm run typecheck:dashboard` | `tsc` em modo estrito, sem variáveis ou parâmetros não usados |
| `npm run lint:dashboard` | ESLint (TypeScript + regras de hooks do React) |
| `npm run test:dashboard` | Vitest sobre a lógica de domínio e a navegação |
| `npm run check:dashboard` | As três verificações acima em sequência |
| `npm run build:dashboard` | Build de produção |

## Organização do código

```text
src/
├── main.tsx
├── app/          Casca da aplicação e orquestração de estado
│   ├── App.tsx, Sidebar.tsx, Topbar.tsx, ConnectionBanner.tsx
│   ├── navigation.ts        Telas, grupos do menu e rotas por hash
│   ├── useDashboard.ts      Compõe os hooks e deriva os dados das telas
│   └── hooks/               Um hook por responsabilidade (ver abaixo)
├── components/   Componentes compartilhados (Panel, Dialog, StatusPill, ToastRegion...)
├── features/     Uma pasta por tela ou área: overview, subject, recording, session,
│                 sensors, report, live, clients, topics, diagnostics, guide
├── domain/       Lógica pura e testada, sem React (protocolo, lifecycle, relatório...)
├── lib/          Utilitários genéricos (formatação, download, storage)
└── styles/       CSS por área, a partir de tokens de design (tokens.css)
```

Regras de dependência: `domain/` não importa de `app/`, `components/` nem `features/`; as telas recebem dados e ações por props e não acessam `fetch`, `WebSocket` ou `localStorage` diretamente.

Hooks em `app/hooks/`:

| Hook | Responsabilidade |
|---|---|
| `useHubSettings` | Endereço e token do hub (validados antes de aplicar) |
| `useHubStatus` | Polling de `/health` e `/status`, com estados carregando/online/offline |
| `useHubSocket` | WebSocket de monitoramento, com reconexão automática e backoff |
| `useStreamBuffer` | Janela de eventos ao vivo; telemetria de alta frequência agrupada por frame |
| `useExperienceLifecycle` | Máquina de estados da experiência (`experience.lifecycle`) e recuperação de runs |
| `useCommandDispatch` | Comandos com ACK para Unreal e Sensor Manager, com histórico |
| `useSessionSetup` | Cadastro do sujeito e perfil de captura, persistidos localmente |
| `useHashRoute` | Navegação por hash (`#/session/report`): voltar/avançar e recarregar funcionam |
| `useToasts` | Avisos temporários de confirmação |

## Telas

| Menu | Tela | Conteúdo |
|---|---|---|
| Início | **Visão geral** | Prontidão do sistema, sensor em foco, próximos passos e eventos recentes |
| Preparar | **Sujeito** | Cadastro pseudônimo, fatores que afetam a HRV e consentimento |
| Preparar | **Gravação** | Modo (só transmitir, gravar, híbrido) e sinais por sensor |
| Operar | **Controle da sessão** | Iniciar/encerrar, comandos, markers, timeline, sensores, histórico e relatório |
| Operar | **Ao vivo** | Waveform de ECG e tendências de HR e RR |
| Monitorar | **Clientes** | Clientes conectados ao hub, por papel |
| Monitorar | **Tópicos** | Stream de eventos com filtro, pausa e inspeção de payload |
| Sistema | **Diagnóstico** | Configuração de rede, saúde do hub e exportação de diagnóstico |
| Sistema | **Guia de uso** | Passo a passo de uma sessão e legenda dos selos |

## Comportamento em uma sessão

- `Visão geral`, `Clientes` e `Diagnóstico` usam dados reais de `/health` e `/status`.
- O dashboard abre um WebSocket como cliente `dashboard-ui`, assina os tópicos oficiais e também os tópicos extras declarados pelos sensores. Se a conexão cai, um aviso aparece em todas as telas e a reconexão é automática.
- **Iniciar experiência** e **Encerrar experiência** publicam `experience.lifecycle`. O `started` carrega o perfil de captura e, se houver, o snapshot do sujeito. Eventos de lifecycle vindos do Unreal/Blueprint também iniciam e encerram a experiência.
- Encerrar, iniciar a próxima experiência e iniciar com o cadastro incompleto pedem confirmação. O motivo de um botão indisponível fica visível ao lado dele.
- **Pausar sessão** e **Retomar sessão** vão para `unreal.commands` com `requiresAck=true` e têm duas confirmações: o ACK `accepted` (o cliente aceitou) e o `unreal.state` (o stream confirmou o estado).
- **Markers** são enviados sem diálogo de confirmação, por Enter ou botão, para o carimbo de tempo corresponder ao momento observado. Com um cliente inscrito em `unreal.commands`, o marker vai como comando `add-marker` e entra na timeline quando o Unreal publica `experience.marker`. Sem esse cliente, o dashboard publica `experience.marker` diretamente.
- Se o hub reportar uma run ativa que o dashboard não reconhece, a tela oferece **Encerrar run pendente** antes de permitir um novo início.
- O relatório abre sozinho ao encerrar a experiência. Ele usa apenas eventos recebidos por este dashboard e restaurados do `localStorage`: outro navegador ou computador não tem o mesmo histórico, e iniciar a próxima experiência o substitui.

## Exportações do relatório

- **Relatório JSON**: envelope `schemaVersion: 1` com `summary`, `report`, `analytics`, `timeline`, `commandHistory`, `sensors` e, quando preenchidos, `subject` e `capture`.
- **Markers CSV**: uma linha por marker, com tempo da experiência, rótulo, observação, origem, BPM/RR/sinal do instante e `commandId` quando existir.
- **Biometria CSV**: resumo por sensor (amostras, BPM mín/méd/máx, RR médio, IBI total, falhas e sinal ruim).
- **Biometria no tempo CSV**: amostras biométricas no eixo de tempo da experiência. Não exporta os arrays brutos de `ibiMs`.
- **Timeline CSV**: eventos de marker, estado, lifecycle e biometria observados na experiência.

Os nomes de colunas e chaves dos arquivos são estáveis. Os campos `title` e `detail` da timeline são texto de exibição e seguem o idioma da interface.

A exportação binária (`.npy`/`.mat`) do ECG bruto é feita pelo CLI do `polarh10_driver`, a partir do log do hub.

## Acessibilidade e usabilidade

A interface foi revisada contra as heurísticas de Nielsen. Pontos que valem manter em mudanças futuras:

- O estado da conexão com o hub e com o stream fica sempre visível no topo.
- Toda ação tem retorno: aviso temporário após exportar, estado "aguardando" nos botões, motivo visível quando algo está indisponível.
- Ações sem volta pedem confirmação; os diálogos fecham com Esc, prendem o foco e o devolvem a quem os abriu.
- As cores de status têm contraste de pelo menos 4,5:1 e nunca são o único sinal: há sempre texto.
- Tabelas e gráficos rolam dentro do próprio cartão; o layout se adapta até a largura de celular.
