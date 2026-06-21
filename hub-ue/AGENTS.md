# AGENTS.md

Guia curto para agentes e colaboradores. Para contexto do produto, leia `README.md` e `docs/README.md`.

## Stack Detectada

- Python >= 3.11 com FastAPI, WebSocket, Pydantic, Uvicorn e websockets.
- Unreal Engine plugin em C++.
- Dashboard local em React/Vite/TypeScript.
- PowerShell para scripts de instalacao, checagem e empacotamento Unreal.
- GitHub Actions para release do plugin Unreal.

## Estrutura Principal

- `apps/hub`: hub Python, schemas, broker, logger, CLIs e simuladores.
- `apps/hub/tests`: testes automatizados do hub.
- `apps/dashboard`: dashboard Vite/React para operacao local, diagnostico e report.
- `docs`: arquitetura, protocolo, integracao Unreal e releases.
- `unreal/Plugins/QuestSupervisor`: plugin Unreal canonico.
- `unreal/QuestSupervisorHost`: projeto host para validacao local.
- `tools/unreal`: scripts de instalacao, checagem e empacotamento.

## Comandos Reais

Setup:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e apps\hub
```

Dev:

```powershell
.\.venv\Scripts\biofeedback-hub
```

Teste:

```powershell
.\.venv\Scripts\python -m unittest discover -s apps\hub\tests
```

Verificacao Python:

```powershell
.\.venv\Scripts\python -m compileall -q apps\hub\src apps\hub\tests
```

Lint:

```text
TODO: comando de lint nao encontrado.
```

Build/package do plugin Unreal:

```powershell
.\tools\unreal\test_package_quest_supervisor_plugin.ps1
.\tools\unreal\package_quest_supervisor_plugin.ps1 -OutputDir dist
```

## Branches e PRs

- Use uma branch curta por mudanca, por exemplo `chore/add-agents-md`.
- Mantenha PRs pequenos, com resumo do impacto e comandos executados.
- Stage apenas os arquivos da mudanca; nao inclua trabalho local nao relacionado.
- Nao misture refatoracao ampla com feature, bugfix ou doc pequena.
- Atualize `docs/protocol.md` ao mudar envelope, topicos, payloads ou ACKs.
- Atualize docs Unreal ao mudar plugin, instalacao ou fluxo operacional.

## Seguranca

- Nao commitar segredos, tokens, dados sensiveis ou logs de sessao.
- Nao alterar caches/builds gerados como `.venv`, `Binaries`, `Intermediate`, `DerivedDataCache`, `Saved`, `dist` ou `data/runtime` sem necessidade explicita.
- Nao reverter mudancas de outras pessoas sem autorizacao.

## Criterio de Pronto

- Mudanca focada no caminho ativo do projeto.
- Testes/verificacoes relevantes executados, ou limitacao explicada.
- Documentacao atualizada quando contrato, protocolo ou integracao mudarem.
- PR descreve o que mudou, como foi validado e pendencias conhecidas.
