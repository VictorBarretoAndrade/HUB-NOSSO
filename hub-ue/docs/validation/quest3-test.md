# Validação no Meta Quest 3

Este arquivo é um **registro de validação técnica** do fluxo no headset físico. Ele não é o guia principal de instalação em projetos Unreal.

Para aplicar o plugin em outro projeto, use:

```text
docs/unreal-project-integration.md
```

## Propósito

Registrar evidências de que o hub Python e o plugin `QuestSupervisor` funcionam ponta a ponta no Meta Quest 3:

```text
Hub Python -> WebSocket -> TesteVR no Quest 3 -> plugin QuestSupervisor -> ACK de volta ao hub
```

Este documento serve para desenvolvedores confirmarem o estado validado do projeto, reproduzirem o teste quando necessário e entenderem quais partes ainda dependem do ambiente local.

## Ambiente validado

- Data: 2026-04-24.
- Headset: Meta Quest 3.
- Projeto consumidor: `C:\Users\LucasG\Documents\Unreal Projects\TesteVR`.
- Package Android: `com.Lucas.TesteVR`.
- Hub: `0.0.0.0:8787`.
- Endpoint no app: `192.168.1.19:8787`.
- Plugin usado: cópia de `unreal/Plugins/QuestSupervisor`.
- Cliente conectado no hub: `unreal-Quest-3`.

## Configuração esperada no TesteVR

`Config/DefaultGame.ini`:

```ini
[/Script/QuestSupervisor.QuestSupervisorSettings]
bSupervisorEnabled=True
bAutoConnectOnStartup=True
SupervisorEndpoint=192.168.1.19:8787
DeviceId=
DeviceLabel=
AppId=quest-supervisor-testevr
AppVersion=0.1.0
HeadsetModel=Meta Quest 3
bAutoAckCommands=False
HeartbeatIntervalSeconds=2.0
InitialReconnectDelaySeconds=1.0
MaxReconnectDelaySeconds=30.0
AuthToken=
```

`Config/DefaultEngine.ini`:

```ini
[/Script/EngineSettings.GameMapsSettings]
GameInstanceClass=/Script/Engine.GameInstance
```

O `TesteVR` validado não depende mais de bootstrap em `TesteVRGameInstance`.

## Actor de ponte no mapa

O mapa `/Game/VRTemplate/VRTemplateMap` recebeu um `QuestSupervisorCommandBridgeActor`.

Esse Actor:

- usa `QuestSupervisorComponent` internamente;
- aceita `pause-session`;
- rejeita ações desconhecidas;
- permite testar ACK manual sem C++ no projeto consumidor.

Script usado para inserir o Actor:

```powershell
& 'C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor-Cmd.exe' 'C:\Users\LucasG\Documents\Unreal Projects\TesteVR\TesteVR.uproject' -run=pythonscript -script='C:\Codex\quest-supervisor-ue\tools\unreal\place_supervisor_bridge.py' -unattended -nop4 -nullrhi
```

## Geração e instalação validadas

O APK foi packageado e instalado no Quest 3 com `RunUAT BuildCookRun`.

Comando base usado:

```powershell
& 'C:\Program Files\Epic Games\UE_5.7\Engine\Build\BatchFiles\RunUAT.bat' BuildCookRun -project='C:\Users\LucasG\Documents\Unreal Projects\TesteVR\TesteVR.uproject' -noP4 -platform=Android -clientconfig=Development -cook -cookflavor=ASTC -allmaps -build -stage -pak -package -archive -archivedirectory='C:\Users\LucasG\Documents\Unreal Projects\TesteVR\ArchiveBuild\BlueprintFirst' -deploy
```

Resultado:

```text
BUILD SUCCESSFUL
adb install -r ... TesteVR-arm64.apk
Success
```

## Evidência de conexão

Após iniciar o app no Quest 3:

```powershell
.\.venv\Scripts\biofeedback-status
```

Resultado observado:

```text
Clients: 1

Clients
- unreal-Quest-3 [unreal] caps=commandExecution, logs, sceneLoading, telemetry subs=unreal.commands outbox=0
```

Logcat relevante:

```text
QuestSupervisor endpoint set to ws://192.168.1.19:8787/ws
QuestSupervisor WebSocket connected to ws://192.168.1.19:8787/ws
```

## Evidência de ACK

Comando aceito:

```powershell
.\.venv\Scripts\biofeedback-command --action pause-session --arg reason=blueprint-quest-test
```

Resultado observado:

```text
commandId=5afdbe6a-f817-47a4-b53b-167c1a5af454
status=accepted
clientId=unreal-Quest-3
```

Comando rejeitado:

```powershell
.\.venv\Scripts\biofeedback-command --action unknown-action --arg reason=blueprint-quest-test
```

Resultado observado:

```text
commandId=8f193e91-c467-44f6-868a-384aadcfa9f8
status=rejected
clientId=unreal-Quest-3
```

Logcat relevante:

```text
QuestSupervisor command 5afdbe6a-f817-47a4-b53b-167c1a5af454 received; waiting for game-provided ACK.
QuestSupervisor command 8f193e91-c467-44f6-868a-384aadcfa9f8 received; waiting for game-provided ACK.
```

## Observações

- O log do plugin confirma o recebimento do comando e que o ACK veio da lógica do jogo/bridge.
- O CLI confirma o resultado final do ACK roteado pelo hub.
- Se o IP LAN do PC mudar, atualize `SupervisorEndpoint`.
- Se o Quest aparecer no `biofeedback-status`, mas o comando não retornar ACK, confirme se existe um Actor de ponte ou Blueprint respondendo ao comando.

## Próxima validação recomendada

Repetir este teste depois de mudanças relevantes no plugin, copiando novamente a versão canônica do repositório para o `TesteVR`. Isso garante que o projeto externo está usando a mesma versão validada no repositório.
