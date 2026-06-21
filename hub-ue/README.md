# Biofeedback Hub UE

Base local-first para conectar experiências Unreal/Meta Quest a um hub Python de biofeedback. O hub recebe mensagens por WebSocket, valida envelopes JSON, redistribui eventos por tópicos e salva logs locais de sessão.

O caminho recomendado para começar é:

1. Rodar o hub Python.
2. Testar o fluxo sem Unreal usando simuladores ou o demo completo.
3. Conectar o plugin `QuestSupervisor` em um projeto Unreal.
4. Usar o dashboard local para acompanhar clientes, comandos, markers e relatórios.

## Quick start do hub

Na raiz do repositório:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e apps\hub
.\.venv\Scripts\biofeedback-hub
```

Por padrão, o hub escuta em `0.0.0.0:8787`:

- `GET http://127.0.0.1:8787/health`
- `GET http://127.0.0.1:8787/status`
- `WebSocket ws://127.0.0.1:8787/ws`

## Dashboard local

Para observar health/status, clientes, tópicos, comandos e relatórios:

```powershell
npm install
npm run dev:dashboard
```

Abra `http://127.0.0.1:5173`. O dashboard usa `http://127.0.0.1:8787` como endpoint padrão do hub e permite alterar o endpoint em **Diagnostics**.

Para subir hub, dashboard e simuladores locais juntos:

```powershell
npm run dev:demo
```

O demo usa o hub em `http://127.0.0.1:8788`, dashboard em `http://127.0.0.1:5173`, simulador Unreal inscrito em `unreal.commands`, simulador HRV e logger. Para parar os processos registrados:

```powershell
npm run dev:demo:stop
```

Detalhes do Session Control, lifecycle, markers e exports ficam em [apps/dashboard/README.md](apps/dashboard/README.md).

## Teste sem Unreal

Abra terminais separados para observar eventos, simular HRV e simular um cliente Unreal:

```powershell
.\.venv\Scripts\biofeedback-sim --mode logger
.\.venv\Scripts\biofeedback-sim --mode hrv
.\.venv\Scripts\biofeedback-sim --mode unreal
```

Em outro terminal, envie comandos críticos e confirme os ACKs:

```powershell
.\.venv\Scripts\biofeedback-command --action pause-session --arg reason=operator
.\.venv\Scripts\biofeedback-command --action resume-session --arg reason=operator
.\.venv\Scripts\biofeedback-command --action add-marker --arg reason=operator --arg markerId=marker-cli-1 --arg label=stimulus-start --arg note="first block"
.\.venv\Scripts\biofeedback-status
.\.venv\Scripts\biofeedback-doctor
```

## Simulacao multi-sensor no dashboard

Para validar multiplos sensores no dashboard real, use este fluxo em tres terminais:

```powershell
.\.venv\Scripts\biofeedback-hub
```

```powershell
npm run dev:dashboard
```

```powershell
.\.venv\Scripts\biofeedback-sim --mode multi-sensor
```

Abra `http://127.0.0.1:5173`. Na **Operational Overview**, use o seletor **Viewing** em **Sensor readiness** para alternar entre HRV, ECG, IMU, temperatura e qualidade do ar. O painel **Live sensor data** e a aba **Session Control > Sensors** permitem exportar as amostras recebidas em JSON.

## Conectar Unreal

O plugin canônico fica em:

```text
unreal/Plugins/QuestSupervisor
```

Para instalar em um projeto Unreal consumidor:

```powershell
.\tools\unreal\install_quest_supervisor_plugin.ps1 -ProjectPath "C:\Caminho\MeuProjetoUnreal"
.\tools\unreal\check_quest_supervisor_project.ps1 -ProjectPath "C:\Caminho\MeuProjetoUnreal"
```

No Unreal Editor, configure `Edit > Project Settings > Plugins > Quest Supervisor`:

- `Auto Connect On Startup`: ligado.
- `Supervisor Endpoint`: `127.0.0.1:8787` no Editor ou o IP LAN do PC no Quest.
- `Auto Ack Commands`: `false` para projetos reais que vão aceitar/rejeitar comandos em Blueprint.

O guia completo está em [docs/unreal-project-integration.md](docs/unreal-project-integration.md).

## Documentação

- [docs/README.md](docs/README.md): mapa por intenção para saber o que ler primeiro.
- [docs/architecture.md](docs/architecture.md): visão da arquitetura do hub e do plugin.
- [docs/protocol.md](docs/protocol.md): envelope WebSocket, tópicos e ACK.
- [docs/unreal-project-integration.md](docs/unreal-project-integration.md): instalação e teste do plugin em projetos Unreal.
- [docs/websocket-device-integration.md](docs/websocket-device-integration.md): guia para conectar sensores e dispositivos genericos via WebSocket.
- [apps/dashboard/README.md](apps/dashboard/README.md): detalhes do dashboard, Session Control e exports.

## Estrutura

- `apps/hub`: hub Python, broker, schemas, simuladores e CLIs.
- `apps/dashboard`: dashboard Vite/React local para operação e diagnóstico.
- `unreal/Plugins/QuestSupervisor`: plugin Unreal reutilizável.
- `unreal/QuestSupervisorHost`: projeto host usado para validar o plugin no repositório.
- `tools/unreal`: scripts de instalação, checagem e empacotamento do plugin.
- `tools/dev`: scripts para subir e parar o demo local.
- `docs`: guias, referências técnicas, histórico e validações.

## Verificação

```powershell
$env:PYTHONPATH="C:\Codex\quest-supervisor-ue\apps\hub\src"
python -m unittest discover -s apps\hub\tests
python -m compileall -q apps\hub\src apps\hub\tests
npm run typecheck:dashboard
npm run build:dashboard
```
