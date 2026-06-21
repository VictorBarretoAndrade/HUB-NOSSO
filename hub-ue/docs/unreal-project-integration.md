# Guia de integração Unreal

Guia prático para instalar o hub Python e o plugin `QuestSupervisor` em qualquer projeto Unreal Engine sem escrever C++ no projeto consumidor.

## Resultado esperado

Depois deste fluxo, o projeto Unreal deve:

- conectar no hub Python por WebSocket puro;
- enviar `hello`, heartbeat e logs automaticamente;
- assinar `unreal.commands`;
- receber comandos em Blueprint;
- aceitar ou rejeitar comandos com ACK;
- funcionar tanto no Editor quanto no Meta Quest, mudando apenas o endpoint.

## 1. Instalar o plugin

Origem canônica neste repositório:

```text
C:\Codex\quest-supervisor-ue\unreal\Plugins\QuestSupervisor
```

Destino no projeto Unreal consumidor:

```text
<ProjetoUnreal>\Plugins\QuestSupervisor
```

Exemplo:

```text
C:\Users\LucasG\Documents\Unreal Projects\TesteVR\Plugins\QuestSupervisor
```

Depois de copiar, abra o projeto Unreal e aceite recompilar se o Editor pedir.

Use o script oficial para sincronizar automaticamente a versão canônica do plugin em um projeto local:

```powershell
cd C:\Codex\quest-supervisor-ue
.\tools\unreal\install_quest_supervisor_plugin.ps1 -ProjectPath "<ProjetoUnreal>"
```

Antes de copiar de verdade, você pode simular:

```powershell
.\tools\unreal\install_quest_supervisor_plugin.ps1 -ProjectPath "<ProjetoUnreal>" -WhatIf
```

Depois da instalação, rode o diagnóstico do projeto:

```powershell
.\tools\unreal\check_quest_supervisor_project.ps1 -ProjectPath "<ProjetoUnreal>"
```

## 1.1. Gerar pacote para outro desenvolvedor

Se a pessoa que vai usar o plugin não precisa clonar este repositório inteiro, gere um pacote limpo:

```powershell
cd C:\Codex\quest-supervisor-ue
.\tools\unreal\package_quest_supervisor_plugin.ps1
```

O script cria:

```text
dist/QuestSupervisor-<versao>/
dist/QuestSupervisor-<versao>.zip
```

O ZIP contém somente:

- `QuestSupervisor.uplugin`;
- `Source`;
- `Config`.

Ele não inclui `Intermediate`, `Binaries`, `Saved` ou outros artefatos locais.

Quando uma tag `v*` é publicada no GitHub, o workflow `Release Unreal Plugin` executa esse mesmo empacotamento automaticamente e anexa o ZIP à GitHub Release. O workflow também pode ser iniciado manualmente pela aba `Actions` usando `workflow_dispatch` e informando a tag desejada.

Para instalar a partir do ZIP:

1. Extraia `QuestSupervisor-<versao>.zip`.
2. Copie a pasta `QuestSupervisor` extraída para `<ProjetoUnreal>/Plugins/QuestSupervisor`.
3. Abra o projeto Unreal e aceite recompilar se o Editor pedir.
4. Rode `check_quest_supervisor_project.ps1` a partir deste repositório, se ele estiver disponível no ambiente de desenvolvimento.

## 2. Configurar no Project Settings

No Unreal Editor:

1. Abra `Edit > Project Settings`.
2. Vá em `Plugins > Quest Supervisor`.
3. Configure:

```text
Supervisor Enabled: true
Auto Connect On Startup: true
Supervisor Endpoint: 127.0.0.1:8787
Auto Ack Commands: false
App Id: nome-do-projeto
App Version: 0.1.1-dev
Headset Model: Meta Quest 3
Auth Token: vazio, ou o token local do hub
```

Use `127.0.0.1:8787` para teste no Editor na mesma máquina do hub.

Para Meta Quest físico, use o IP LAN do PC que roda o hub:

```text
192.168.x.x:8787
```

Não inclua `ws://`. O plugin normaliza internamente para:

```text
ws://host:porta/ws
```

Para testes avançados, o endpoint também pode ser sobrescrito na linha de comando:

```text
-QuestSupervisorEndpoint=192.168.x.x:8787
```

E o token local:

```text
-QuestSupervisorToken=local-secret
```

Exemplos copiáveis ficam em:

```text
docs/templates/DefaultGame.Editor.ini
docs/templates/DefaultGame.Quest.ini
```

## 3. Blueprint sem C++

Para receber comandos em Blueprint:

1. Arraste `QuestSupervisorCommandBridgeActor` para o mapa.
2. Em `Accepted Command Actions`, deixe `pause-session`, `resume-session` e `add-marker`, ou adicione ações do seu projeto.
3. Deixe `Reject Unhandled Commands` ligado para rejeitar comandos desconhecidos.

Esse Actor já usa `Quest Supervisor Component` internamente e é suficiente para testar sem escrever C++.

Quando ele auto-aceita `add-marker`, o Actor valida `Arguments["label"]`, responde ACK e publica `experience.marker`. Se `label` estiver vazio, ele rejeita o comando para evitar ACK aceito sem marker na timeline do dashboard.

Para inserir esse Actor automaticamente no mapa padrão usado neste repositório:

```powershell
& 'C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor-Cmd.exe' '<ProjetoUnreal>\<ProjetoUnreal>.uproject' -run=pythonscript -script='C:\Codex\quest-supervisor-ue\tools\unreal\place_supervisor_bridge.py' -unattended -nop4 -nullrhi
```

Para uma lógica mais específica, crie um Blueprint próprio:

1. Crie ou escolha um Actor persistente no mapa, por exemplo `BP_SupervisorBridge`.
2. Adicione o componente `Quest Supervisor Component`.
3. No Blueprint, selecione o componente e adicione o evento `On Command Received`.
4. Leia `Command.Action` e decida o que fazer.
5. Chame no componente:

```text
Accept Command
```

ou:

```text
Reject Command
```

Recomendação para projetos reais:

- deixe `Auto Ack Commands = false`;
- aceite somente ações que o jogo realmente suporta;
- rejeite ações desconhecidas.

Para marcar algo que aconteceu durante a experiencia XR, chame o node Blueprint **Send Experience Marker**. Ele existe na `QuestSupervisorBlueprintLibrary` e no `Quest Supervisor Component`.

Campos do node simples:

- `Label`: obrigatorio, por exemplo `door-opened`, `stimulus-start` ou `boss-phase-2`.
- `Note`: opcional, para contexto curto.
- `Source`: opcional, usa `xr` por padrao.
- `Reason`: opcional, para indicar trigger, teste ou origem operacional.

O plugin preenche `DeviceId`, `Timestamp` e `MarkerId` quando eles nao forem enviados. Para payloads avancados, use o node com `FQuestSupervisorExperienceMarker`.

Para deixar o dashboard observar a janela real da experiencia XR, use os nodes Blueprint:

- **Start Experience**: publica `experience.lifecycle` com `event=started`, cria/preenche `runId` e faz o dashboard iniciar a timeline analitica como `Started by XR`.
- **End Experience**: publica `experience.lifecycle` com `event=ended` e o mesmo `runId`, fazendo o dashboard finalizar a experiencia e abrir o Report.
- **Send Experience Lifecycle Event**: node avancado para payloads customizados com `FQuestSupervisorExperienceLifecycleEvent`.

Use **Start Experience** no trigger real que define o começo da coleta analitica, por exemplo início de bloco, entrada em cena ou início da tarefa XR. Use **End Experience** no fim real da tarefa. Os botões locais do dashboard continuam úteis para desenvolvimento, mas o lifecycle vindo do Unreal deve ser a fonte preferencial quando integrado.

Exemplo de regra:

```text
On Command Received
  if Action == "pause-session"
    Accept Command(CommandId, "pause-session accepted")
  else if Action == "add-marker" and Arguments["label"] is not empty
    Send Experience Marker(Label=Arguments["label"], Note=Arguments["note"], Source="dashboard", Reason=Arguments["reason"])
    Accept Command(CommandId, "add-marker accepted")
  else
    Reject Command(CommandId, "Unsupported command")
```

Se você só quer testar conexão, pode deixar `Auto Ack Commands = true`. Nesse modo o plugin aceita todo comando automaticamente, antes da lógica do jogo.

## 4. Subir o hub

Na raiz deste repositório:

```powershell
cd C:\Codex\quest-supervisor-ue
.\.venv\Scripts\biofeedback-hub
```

Se a porta 8787 já estiver ocupada, descubra quem está usando:

```powershell
Get-NetTCPConnection -LocalPort 8787 -State Listen
```

## 5. Testar no Editor

Com o hub rodando:

1. Abra o projeto Unreal.
2. Clique em Play.
3. Em outro PowerShell, consulte o status:

```powershell
cd C:\Codex\quest-supervisor-ue
.\.venv\Scripts\biofeedback-status
```

4. Rode o diagnóstico amigável:

```powershell
.\.venv\Scripts\biofeedback-doctor
```

5. Envie um comando aceito:

```powershell
.\.venv\Scripts\biofeedback-command --action pause-session --arg reason=editor-test
```

6. Envie um comando rejeitado:

```powershell
.\.venv\Scripts\biofeedback-command --action unknown-action --arg reason=editor-test
```

Se o Blueprint estiver respondendo, o primeiro deve voltar `accepted` e o segundo deve voltar `rejected`.

## 6. Testar no Meta Quest

1. Garanta que o PC e o Quest estão na mesma rede.
2. No Project Settings do Unreal, troque `Supervisor Endpoint` para o IP LAN do PC.
3. Packageie e instale no Quest.
4. Abra o app no headset.
5. Rode:

```powershell
.\.venv\Scripts\biofeedback-status
.\.venv\Scripts\biofeedback-doctor
```

6. Envie os comandos de teste:

```powershell
.\.venv\Scripts\biofeedback-command --action pause-session --arg reason=quest-test
.\.venv\Scripts\biofeedback-command --action unknown-action --arg reason=quest-test
```

O teste completo validado no Quest 3 está em:

```text
docs/validation/quest3-test.md
```

## O que o projeto consumidor precisa versionar

O projeto consumidor deve versionar:

- sua cópia de `<ProjetoUnreal>/Plugins/QuestSupervisor`;
- suas configurações em `Config/DefaultGame.ini`;
- seus Blueprints que usam `Quest Supervisor Component`.

Este repositório continua sendo a fonte de desenvolvimento do hub, do plugin e dos guias técnicos.
