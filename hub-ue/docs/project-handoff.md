# Handoff tecnico do projeto

Este documento resume o estado atual do projeto e orienta os proximos passos para as equipes de backend, frontend e Unreal continuarem o desenvolvimento.

O foco atual e validar o **hub de integracao em tempo real** como base do Presence Training v2: uma camada local-first que conecta experiencias XR, sensores biologicos e uma futura plataforma de analytics para pesquisa cientifica.

## 1. Objetivo do projeto

O objetivo final e construir uma plataforma open-source de analytics XR, com uma proposta parecida com ferramentas como Cognitive3D, mas com foco em:

- integracao simples com Unreal Engine, e futuramente Unity/WebXR;
- suporte a sensores como HRV, EEG, eye tracking e outros sinais;
- uso por pesquisadores sem exigir conhecimento profundo de infraestrutura;
- registro de sessoes, eventos, markers, estados e dados biologicos;
- exports e relatorios adequados para analise cientifica.

Este repositorio cobre a base tecnica inicial: **hub local + plugin Unreal + dashboard operacional**.

## 2. O que este MVP prova

O MVP atual prova que conseguimos:

- conectar clientes por WebSocket;
- usar um envelope JSON unico para mensagens;
- publicar e assinar topicos em tempo real;
- enviar comandos para o Unreal e receber ACK;
- registrar eventos em logs JSONL locais;
- acompanhar clientes, topicos, sessao, markers e relatorios em um dashboard local;
- preparar o caminho para sensores reais publicando em `hrv.raw`.

O proximo passo importante e validar o fluxo com uma **cinta HRV real** em uma experiencia Unreal 5.7 simples, usando o projeto base da Rosalie com VR Expansion Plugin.

## 3. Modulos relacionados no Presence Training v2

Este repositorio toca principalmente estes modulos do projeto maior:

- **Hub de Integracao em Tempo Real**: WebSocket, protocolo, roteamento, logs e sincronizacao.
- **HRV (wearable/cinta)**: captura e integracao de dados biologicos com a sessao.
- **Telemetria e Analytics**: direcao futura da plataforma e do frontend.
- **Estrutura Base**: Unreal 5.7, plugins, pipeline, projeto base e validacao em device.

O hub deve continuar modular. Ele nao deve virar uma aplicacao monolitica com regra de negocio de todos os sensores e dashboards misturada no mesmo lugar.

## 4. Visao geral da arquitetura

![Diagrama renderizado: visao geral da arquitetura](assets/project-handoff/architecture-overview.png)

```mermaid
flowchart LR
    subgraph XR["Unreal / Meta Quest"]
        UEP["QuestSupervisor Plugin"]
        BP["Blueprint / Bridge Actor"]
        EXP["Experiencia XR"]
        EXP --> BP
        BP --> UEP
    end

    subgraph HUB["Hub Python local"]
        WS["FastAPI WebSocket /ws"]
        ENV["MessageEnvelope<br/>Pydantic"]
        BROKER["TopicBroker<br/>publish / subscribe"]
        ACK["ACK Tracker"]
        LOG["Session Logger<br/>JSONL"]
        STATUS["HTTP /health + /status"]
        WS --> ENV
        ENV --> BROKER
        BROKER --> ACK
        BROKER --> LOG
        STATUS --> BROKER
    end

    subgraph SENSORS["Sensores e adapters"]
        HRV["Cinta / sensor HRV"]
        EEG["EEG futuro"]
        OTHER["Outros sensores"]
    end

    subgraph UI["Operacao e analytics"]
        DASH["Dashboard local<br/>React/Vite"]
        EXPORT["Reports e exports<br/>JSON / CSV"]
    end

    UEP <-->|"WebSocket JSON"| WS
    HRV -->|"hrv.raw"| WS
    EEG -->|"eeg.raw"| WS
    OTHER -->|"topicos futuros"| WS
    DASH <-->|"HTTP + WebSocket"| WS
    DASH --> EXPORT
```

## 5. Estrutura do repositorio

```text
apps/hub
  Hub Python, FastAPI, WebSocket, schemas, broker, logger, CLIs e simuladores.

apps/dashboard
  Dashboard local em React/Vite para operacao, diagnostico, session control e exports.

unreal/Plugins/QuestSupervisor
  Plugin Unreal reutilizavel para conectar projetos Unreal ao hub.

unreal/QuestSupervisorHost
  Projeto host usado para validar o plugin dentro deste repositorio.

tools/unreal
  Scripts de instalacao, checagem e empacotamento do plugin.

tools/dev
  Scripts para subir e parar demo local com hub, dashboard e simuladores.

docs
  Guias tecnicos, protocolo, integracao Unreal, integracao de sensores e historico.
```

## 6. Backend: hub Python

O backend atual fica em `apps/hub`.

Componentes principais:

- `biofeedback_hub.main`: aplica FastAPI, expõe `/health`, `/status` e `/ws`.
- `biofeedback_hub.schemas.envelope`: define `MessageEnvelope`, tipos de mensagem, roles e payloads comuns.
- `biofeedback_hub.schemas.topics`: enum de topicos oficiais.
- `biofeedback_hub.core.broker`: controla clientes, assinaturas, publish/subscribe e ACKs pendentes.
- `biofeedback_hub.core.runtime`: orquestra processamento das mensagens.
- `biofeedback_hub.core.session_log`: salva eventos em JSONL.
- `biofeedback_hub.adapters`: base para simuladores/adapters de sensores.
- `biofeedback_hub.tools`: CLIs para simular clientes, consultar status, enviar comandos e diagnosticar o hub.

### Como rodar

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e apps\hub
.\.venv\Scripts\biofeedback-hub
```

Endpoints:

- `GET http://127.0.0.1:8787/health`
- `GET http://127.0.0.1:8787/status`
- `WebSocket ws://127.0.0.1:8787/ws`

### Ferramentas uteis

```powershell
.\.venv\Scripts\biofeedback-sim --mode logger
.\.venv\Scripts\biofeedback-sim --mode hrv
.\.venv\Scripts\biofeedback-sim --mode unreal
.\.venv\Scripts\biofeedback-status
.\.venv\Scripts\biofeedback-doctor
.\.venv\Scripts\biofeedback-command --action add-marker --arg label=stimulus-start
```

## 7. Protocolo de mensagens

Todas as mensagens WebSocket seguem um envelope JSON versionado.

Campos mais importantes:

- `version`: versao do envelope.
- `id`: identificador unico da mensagem.
- `type`: `hello`, `subscribe`, `unsubscribe`, `publish`, `ack` ou `error`.
- `topic`: topico usado em mensagens `publish`.
- `clientId`: cliente que enviou a mensagem.
- `correlationId`: referencia a outra mensagem, usado principalmente em ACK.
- `requiresAck`: indica que a mensagem precisa de confirmacao.
- `collectedAt`: horario de coleta no sensor/dispositivo.
- `hubReceivedAt`: horario aplicado pelo hub ao receber a mensagem.
- `sessionTimeMs`: tempo relativo da experiencia.
- `payload`: conteudo especifico.

Topicos principais:

- `experience.lifecycle`: inicio/fim da experiencia.
- `experience.marker`: eventos, decisoes e markers.
- `unreal.state`: estado observado do Unreal.
- `unreal.commands`: comandos enviados ao Unreal.
- `hrv.raw`: dados brutos de HRV/frequencia cardiaca.
- `hrv.processed`: dados processados de HRV.
- `eeg.raw` e `eeg.processed`: base para EEG futuro.
- `logger.events` e `system.events`: logs e eventos internos.

## 8. Fluxo de uma sessao

![Diagrama renderizado: fluxo de uma sessao](assets/project-handoff/session-flow.png)

```mermaid
sequenceDiagram
    participant D as Dashboard
    participant H as Hub
    participant U as Unreal
    participant S as Sensor HRV
    participant R as Report

    D->>H: subscribe lifecycle, markers, hrv.raw, unreal.state
    U->>H: publish experience.lifecycle started
    H-->>D: sessao iniciada

    loop Durante a experiencia
        S->>H: publish hrv.raw
        H-->>D: amostra biometrica
        U->>H: publish experience.marker
        H-->>D: marker na timeline
        U->>H: publish unreal.state
        H-->>D: estado observado
    end

    U->>H: publish experience.lifecycle ended
    H-->>D: sessao encerrada
    D->>R: gerar report local
    R-->>D: JSON / CSV / timeline
```

O ponto central: a sessao precisa alinhar **tempo**, **markers**, **mudancas de estado** e **dados biologicos**.

## 9. Unreal: plugin QuestSupervisor

O plugin canônico fica em `unreal/Plugins/QuestSupervisor`.

Papel do plugin:

- conectar ao hub por WebSocket;
- enviar `hello`;
- assinar `unreal.commands`;
- publicar `unreal.state`;
- permitir que Blueprint publique lifecycle e markers;
- responder comandos com ACK;
- expor configuracao em Project Settings.

Fluxo esperado em projetos consumidores:

![Diagrama renderizado: integracao Unreal](assets/project-handoff/unreal-integration.png)

```mermaid
flowchart TB
    SETTINGS["Project Settings<br/>endpoint, token, auto connect"] --> PLUGIN["QuestSupervisor Plugin"]
    PLUGIN --> SUBSYSTEM["QuestSupervisorSubsystem"]
    SUBSYSTEM -->|"hello + subscribe unreal.commands"| HUB["Biofeedback Hub"]

    BP["Blueprint / Bridge Actor"] -->|"Start / End Experience"| SUBSYSTEM
    BP -->|"Add Marker"| SUBSYSTEM
    SUBSYSTEM -->|"experience.lifecycle"| HUB
    SUBSYSTEM -->|"experience.marker"| HUB
    SUBSYSTEM -->|"unreal.state"| HUB

    DASH["Dashboard"] -->|"unreal.commands<br/>requiresAck=true"| HUB
    HUB -->|"command"| SUBSYSTEM
    SUBSYSTEM -->|"ack accepted/rejected"| HUB
    HUB --> DASH
```

Para instalar em outro projeto Unreal:

```powershell
.\tools\unreal\install_quest_supervisor_plugin.ps1 -ProjectPath "C:\Caminho\MeuProjetoUnreal"
.\tools\unreal\check_quest_supervisor_project.ps1 -ProjectPath "C:\Caminho\MeuProjetoUnreal"
```

Para o projeto da Rosalie, a validacao deve focar em:

- Unreal 5.7;
- VR Expansion Plugin;
- ambiente de blocagem simples;
- lifecycle de inicio/fim;
- markers de decisoes ou mudancas de estado;
- dados HRV chegando no mesmo intervalo da experiencia.

## 10. Sensor HRV

O proximo marco tecnico e conectar uma cinta HRV real.

O sensor deve entrar como cliente `sensor` e publicar no topico `hrv.raw`.

Payload esperado inicialmente:

```json
{
  "version": 1,
  "type": "publish",
  "topic": "hrv.raw",
  "clientId": "hrv-sensor",
  "collectedAt": "2026-04-26T12:00:00.000Z",
  "sessionTimeMs": 12345,
  "payload": {
    "bpm": 74,
    "rrMs": 810.81,
    "ibiMs": [808, 812],
    "sequence": 42,
    "source": "ble-heart-rate-service",
    "device": "nome-do-dispositivo"
  }
}
```

Fluxo recomendado:

![Diagrama renderizado: fluxo do sensor HRV](assets/project-handoff/hrv-sensor-flow.png)

```mermaid
flowchart LR
    STRAP["Cinta HRV<br/>BPM / IBI"] --> ADAPTER["Adapter BLE<br/>ou app bridge"]
    ADAPTER -->|"hello role=sensor"| HUB["Hub /ws"]
    ADAPTER -->|"publish hrv.raw"| HUB
    HUB --> DASH["Dashboard<br/>sensor conectado"]
    HUB --> LOG["Logs JSONL"]
    DASH --> EXPORT["Export CSV/JSON"]
```

Para desenvolvimento, use `docs/websocket-device-integration.md` como referencia generica. Qualquer sensor real deve transformar sua leitura em mensagens WebSocket publicadas no topico adequado, por exemplo `hrv.raw`, `eeg.raw` ou um topico novo como `imu.accelerometer.raw`.

## 11. Frontend: dashboard atual

O frontend atual fica em `apps/dashboard`.

Stack:

- Vite;
- React;
- TypeScript;
- Vitest;
- lucide-react para icones.

Funcoes atuais:

- `Overview`: leitura de estado geral.
- `Clients`: clientes conectados e roles.
- `Diagnostics`: endpoint do hub, health/status e token local.
- `Topics`: abre WebSocket como `dashboard-ui` e mostra eventos recebidos.
- `Session Control`: start/end local, pause/resume, add-marker, timeline e report.
- `Report`: resumo de sessao, biometria, markers, command issues e exports.

Arquivos de dominio importantes:

- `api.ts`: chamadas HTTP/WebSocket.
- `topics.ts`: topicos conhecidos pelo dashboard.
- `sessionState.ts`: estado observado da sessao.
- `experienceLifecycle.ts`: lifecycle de experiencia.
- `markers.ts`: tratamento de markers.
- `sensorTelemetry.ts`: dados biometricos.
- `experienceAnalytics.ts`: calculos da timeline/analytics.
- `experienceReport.ts`: geracao de report.
- `experiencePersistence.ts`: persistencia local no navegador.

Como rodar:

```powershell
npm install
npm run dev:dashboard
```

Demo local com hub, dashboard e simuladores:

```powershell
npm run dev:demo
```

## 12. Frontend: direcao futura

O dashboard atual e uma ferramenta operacional. A plataforma final deve evoluir para analytics XR.

![Diagrama renderizado: evolucao futura do frontend](assets/project-handoff/frontend-roadmap.png)

```mermaid
flowchart LR
    CURRENT["Dashboard local<br/>debug, clients, topics,<br/>session control"] --> REPORTS["Reports de sessao<br/>timeline, markers,<br/>biometria, exports"]
    REPORTS --> PLATFORM["Plataforma Analytics XR<br/>projetos, participantes,<br/>experimentos, sensores"]

    PLATFORM --> CONNECTORS["Conectores<br/>Unreal, Unity, WebXR"]
    PLATFORM --> MODULES["Modulos<br/>HRV, EEG, eye tracking,<br/>surveys, eventos"]
    PLATFORM --> RESEARCH["Pesquisa cientifica<br/>exports, reprodutibilidade,<br/>documentacao"]

    HUB["Hub local<br/>coletor em tempo real"] --> CURRENT
    HUB --> REPORTS
    HUB --> PLATFORM
```

Prioridades para a equipe de frontend:

1. Separar claramente o que e **debug operacional** do que e **produto analytics**.
2. Criar modelo visual para projetos, participantes, sessoes e sensores.
3. Melhorar a visualizacao da timeline com markers, estados e biometria.
4. Definir formato de reports e exports que faca sentido para pesquisa.
5. Pensar em UX para pesquisadores: configuracao simples, linguagem clara e baixa barreira tecnica.

## 13. Proximos passos recomendados

### Marco 1: validar HRV real

Objetivo:

- conectar uma cinta HRV real ao hub;
- publicar `hrv.raw`;
- confirmar dados no dashboard e logs.

Definition of done:

- sensor aparece em `/status` como role `sensor`;
- dashboard mostra atividade em `hrv.raw`;
- logs JSONL contem amostras reais;
- ha um runbook reproduzivel.

### Marco 2: validar Unreal 5.7 com VR Expansion Plugin

Objetivo:

- integrar o plugin no projeto base da Rosalie;
- publicar lifecycle e markers a partir da experiencia;
- manter o ambiente simples, em blocagem.

Definition of done:

- Unreal conecta no hub;
- `experience.lifecycle started/ended` e publicado;
- ao menos dois markers reais sao publicados;
- o dashboard mostra timeline coerente.

### Marco 3: validar sessao completa

Objetivo:

- rodar Unreal + sensor + dashboard ao mesmo tempo;
- alinhar tempo, markers e biometria;
- encerrar a sessao com report/export.

Definition of done:

- report JSON exportado;
- CSV de markers exportado;
- CSV de biometria exportado;
- video curto mostra o fluxo ponta a ponta.

### Marco 4: preparar plataforma frontend

Objetivo:

- transformar aprendizados do dashboard em arquitetura de produto;
- definir telas principais da plataforma;
- preservar compatibilidade com o hub local.

Definition of done:

- proposta de arquitetura frontend documentada;
- modelo inicial de dados para projetos/sessoes/sensores;
- wireframe ou prototipo das telas principais;
- decisao clara do que continua local e do que vira backend persistente.

## 14. Divisao sugerida de tarefas

### Backend / sensores

- Implementar adapter da cinta HRV.
- Formalizar payload `hrv.raw`.
- Melhorar validacao de payloads por topico.
- Criar runbook de pareamento/conexao.
- Testar perda de conexao, reconexao e amostras invalidas.

### Backend / hub

- Melhorar semantica de `sessionId`, `runId` e `sessionTimeMs`.
- Definir estrategia de persistencia futura: JSONL, SQLite, Parquet ou combinacao.
- Ampliar testes de ACK, lifecycle, markers e sensor telemetry.
- Melhorar `biofeedback-doctor` para destacar sensores reais e atividade HRV.

### Unreal

- Integrar plugin ao projeto Unreal 5.7 da Rosalie.
- Criar Blueprint/Bridge para lifecycle e markers.
- Testar com VR Expansion Plugin.
- Validar no Meta Quest 3 ou PCVR.
- Documentar configuracao do projeto consumidor.

### Frontend

- Refinar Session Control e Report com base na demo real.
- Melhorar visualizacao de HRV ao longo da timeline.
- Criar arquitetura de plataforma: projetos, participantes, sessoes, sensores.
- Definir exports pensando em pesquisadores.
- Separar componentes de dashboard operacional e analytics final.

## 15. Evidencias e prints recomendados

As imagens abaixo foram capturadas do demo local com hub, dashboard e simuladores (`unreal-quest-sim`, `hrv-sim` e `logger-sim`). Elas servem como evidencia do fluxo tecnico sem depender de Meta Quest 3, Unreal Editor ou sensor fisico.

### Dashboard: overview com hub online

![Dashboard Overview com hub online](assets/project-handoff/screenshots/dashboard-overview-hub-online.png)

### Dashboard: clientes simulados conectados

![Dashboard Clients com simuladores conectados](assets/project-handoff/screenshots/dashboard-clients-simulators-connected.png)

### Dashboard: stream de topicos com HRV, estado Unreal e marker

![Dashboard Topics com eventos ao vivo](assets/project-handoff/screenshots/dashboard-topics-with-marker.png)

### Dashboard: timeline da sessao simulada

![Dashboard Session Control com timeline e marker](assets/project-handoff/screenshots/dashboard-session-timeline-events.png)

### Dashboard: report com biometria, marker e exports

![Dashboard Report com resumo e exports](assets/project-handoff/screenshots/dashboard-report-summary-exports.png)

### Terminal e logs JSONL

![Terminal e logs JSONL do demo local](assets/project-handoff/screenshots/terminal-and-log-evidence.png)

Prints que ainda devem ser adicionados depois, quando o hardware/cena estiverem disponiveis:

- Meta Quest 3 rodando a experiencia real.
- Sensor fisico/cinta/relogio conectado.
- Unreal Project Settings do plugin `QuestSupervisor`.
- Blueprint/Bridge usado para publicar lifecycle e markers.

Eu consigo adicionar esses prints no documento se eles estiverem disponiveis como arquivos. Tambem consigo capturar prints do dashboard local se o hub/dashboard estiverem rodando no ambiente desta maquina. Para prints do Meta Quest 3, Unreal Editor ou sensor fisico, o ideal e voce gravar/tirar os prints e me passar os arquivos, porque dependem do hardware e da cena aberta.

## 16. Como trabalhar com Codex neste repositorio

Sugestao para a equipe:

- cada pessoa trabalha em uma branch propria;
- antes de editar, pedir ao Codex para ler `README.md`, este documento e os docs especificos da tarefa;
- limitar o escopo da branch a uma frente;
- pedir plano antes de grandes mudancas;
- rodar testes antes de pedir review;
- nao misturar refactor geral com feature de sensor, Unreal ou frontend.

Comandos de verificacao:

```powershell
$env:PYTHONPATH="C:\Codex\quest-supervisor-ue\apps\hub\src"
python -m unittest discover -s apps\hub\tests
python -m compileall -q apps\hub\src apps\hub\tests
npm run typecheck:dashboard
npm run build:dashboard
```

## 17. Leitura recomendada

Ordem sugerida para novos devs:

1. `README.md`
2. `docs/project-handoff.md`
3. `docs/architecture.md`
4. `docs/protocol.md`
5. `apps/dashboard/README.md`
6. `docs/unreal-project-integration.md`
7. `docs/websocket-device-integration.md`

Para quem for trabalhar no Unreal, ler tambem:

- `docs/unreal-plugin-technical.md`

Para quem for trabalhar em sensores, ler tambem:

- `apps/hub/src/biofeedback_hub/adapters`
- `apps/hub/src/biofeedback_hub/schemas`
- `docs/protocol.md`
