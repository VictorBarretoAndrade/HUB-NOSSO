# Fluxo de integração do QuestSupervisor

Use esta referência durante instalação, atualização, validação ou rollback. A versão canônica deste guia aponta para o fechamento da V0.4 do MVP.

## Entradas obrigatórias

- Projeto: pasta contendo exatamente um `.uproject` ou caminho do arquivo. Se o operador não souber o caminho, ele pode informar apenas a pasta que abre no Unreal, como `C:\Unreal\MeuProjeto`; o Codex deve localizar e mostrar o `.uproject` antes da prévia.
- Destino: `Editor` ou `Quest`.
- Origem: clone local do `hub-ue` ou download autorizado do commit fixo.
- Endpoint: opcional no Editor; obrigatório no Quest.

Fonte remota padrão:

```text
Repositório: Viperpog/hub-ue
Commit: bcb99ddb95c15b6a36d7494e30d4799ffe38bc73
Plugin: unreal/Plugins/QuestSupervisor
```

A release `v0.1.3-dev` é anterior ao fechamento da V0.4 e não deve substituir silenciosamente a fonte fixada acima.

Neste projeto, **V0.4** é o marco funcional do Hub. O descriptor do plugin nesse commit ainda usa `VersionName=0.1.1-dev`; ver esse número após a instalação é esperado e não significa que uma arquitetura anterior foi copiada.

Um clone local também é verificado contra o commit fixado. Alterações nos arquivos do plugin ou nos instaladores oficiais fazem a execução parar. Nesse caso, use um clone limpo que contenha o commit ou escolha o download autorizado.

## Pré-requisitos do computador

- Windows com PowerShell 5.1 ou PowerShell 7.
- Unreal Engine 5.7 instalada.
- Para compilar o plugin a partir do código-fonte: Visual Studio 2022 ou Build Tools com a carga **Desenvolvimento de jogos com C++**, MSVC e Windows SDK.
- Para download de repositório privado: GitHub CLI autenticado com `gh auth login`.

O plugin contém C++. Um projeto criado apenas com Blueprints também pode pedir compilação de módulos ao abrir. Se o compilador não estiver preparado, pare e instale os pré-requisitos antes de insistir na abertura do projeto.

## Prévia obrigatória

Com clone local:

```powershell
& '<skill>\scripts\install_quest_supervisor.ps1' `
  -ProjectPath 'C:\Unreal\MeuProjeto\MeuProjeto.uproject' `
  -SourcePath 'C:\Projetos\hub-ue' `
  -Target Editor `
  -WhatIf
```

Sem clone local, execute primeiro a prévia, que não baixa nada:

```powershell
& '<skill>\scripts\install_quest_supervisor.ps1' `
  -ProjectPath 'C:\Unreal\MeuProjeto\MeuProjeto.uproject' `
  -Target Editor `
  -AllowDownload `
  -WhatIf
```

O `-WhatIf` não baixa, copia, remove nem altera arquivos. Ele informa a origem pretendida. Depois que o operador conferir o projeto, o destino e o endpoint, solicite autorização e repita sem `-WhatIf`, mantendo `-AllowDownload`.

Se o repositório não for público, o download usa silenciosamente a sessão já autenticada do GitHub CLI (`gh auth login`). O token não é mostrado nem gravado pelo helper. Sem clone local e sem uma sessão GitHub autorizada, a instalação é interrompida.

## Aplicação

Repita o comando sem `-WhatIf` apenas depois de o usuário conferir projeto, destino e endpoint. Para Quest:

```powershell
& '<skill>\scripts\install_quest_supervisor.ps1' `
  -ProjectPath 'C:\Unreal\MeuProjeto\MeuProjeto.uproject' `
  -SourcePath 'C:\Projetos\hub-ue' `
  -Target Quest `
  -Endpoint '192.168.0.20:8787'
```

Não use `ws://`, `http://` ou `/ws`. No Quest, o endereço precisa apontar para o computador que executa o Hub na mesma rede local.

O modo `Quest` termina na instalação e configuração do endpoint. Ele não gera APK, não usa ADB e não instala o aplicativo no headset sem uma solicitação posterior e explícita.

## Alterações realizadas

O helper modifica somente:

- `<Projeto>/Plugins/QuestSupervisor`;
- a seção `[/Script/QuestSupervisor.QuestSupervisorSettings]` de `Config/DefaultGame.ini`.

Antes da atualização, ele guarda o plugin, o INI e o `.uproject` em:

```text
<Projeto>/Saved/CodexBackups/QuestSupervisor/<data-hora>/
```

Propriedades de outras seções, chaves desconhecidas do QuestSupervisor, `DeviceId`, `DeviceLabel` e `AuthToken` são preservadas. O token nunca aparece no resumo.

`AppId` é o identificador do aplicativo mostrado ao Hub. Normalmente o operador não precisa informá-lo: o helper preserva o valor existente ou gera um identificador a partir do nome do projeto.

Configuração aplicada:

```ini
[/Script/QuestSupervisor.QuestSupervisorSettings]
bSupervisorEnabled=True
bAutoConnectOnStartup=True
SupervisorEndpoint=127.0.0.1:8787
DeviceId=
DeviceLabel=
AppId=quest-supervisor-meu-projeto
AppVersion=<versão do QuestSupervisor.uplugin>
HeadsetModel=Editor
bAutoAckCommands=False
HeartbeatIntervalSeconds=2.0
InitialReconnectDelaySeconds=1.0
MaxReconnectDelaySeconds=30.0
AuthToken=
```

## Mapa e ponte

O helper apenas informa `GameDefaultMap` e `EditorStartupMap`; ele não salva mapas.

A conexão e a telemetria automática podem funcionar sem a ponte. A ponte é necessária quando o Hub precisa enviar comandos para a experiência, ou quando o projeto usa os eventos dela para controlar a execução. Portanto, primeiro confirme a conexão; depois adicione a ponte somente ao mapa escolhido pelo responsável.

No Unreal Editor:

1. Abra o mapa escolhido pelo responsável do experimento.
2. Em **Place Actors**, procure `QuestSupervisorCommandBridgeActor`.
3. Arraste uma única instância para o mapa.
4. Salve o mapa.
5. Para lógica própria, use `Quest Supervisor Component` em um Blueprint persistente em vez do actor genérico.

Não use automaticamente o script antigo `place_supervisor_bridge.py`, pois ele abre um mapa fixo do template VR.

## Verificação estática

O instalador executa:

```powershell
<HubRepo>\tools\unreal\check_quest_supervisor_project.ps1 -ProjectPath '<Projeto>'
```

Confira:

- plugin encontrado;
- seção de configuração encontrada;
- `AutoConnectOnStartup=True`;
- endpoint sem protocolo;
- versão da origem e destino iguais. Essa comparação é feita pelo helper logo após a cópia; o verificador oficial não compara versões sozinho.

Se o projeto tiver `Source/<Projeto>.Target.cs`, localize a Engine indicada por `EngineAssociation` e ofereça a compilação. Procure primeiro em `C:\Program Files\Epic Games\UE_5.7` e nas instalações registradas pela Epic:

```powershell
& '<UE_ROOT>\Engine\Build\BatchFiles\Build.bat' MeuProjetoEditor Win64 Development `
  -Project='C:\Unreal\MeuProjeto\MeuProjeto.uproject' -WaitMutex -FromMsBuild
```

Não compile enquanto outro Unreal Editor estiver usando o projeto.

Se não existir `Target.cs`, trate o projeto como Blueprint até confirmação. Como o plugin possui código C++, avise que o primeiro carregamento ainda pode exigir Visual Studio/Build Tools; não transforme o projeto nem crie classes C++ automaticamente.

## Validação ao vivo no Editor

Somente após autorização:

1. Inicie o Hub pela cópia local correspondente à V0.4.
2. Inicie o dashboard e registre os PIDs.
3. Abra o projeto no Unreal Editor e peça ao operador para pressionar Play.
4. Consulte `http://127.0.0.1:8787/status`.
5. Confirme um cliente `unreal-*` conectado.
6. Execute `biofeedback-doctor`.
7. Pare apenas os processos que a própria validação iniciou.

Resultado esperado:

- `/status` lista um cliente cujo identificador começa com `unreal-`;
- o dashboard mostra o cliente Unreal conectado e começa a receber heartbeat/telemetria;
- `biofeedback-doctor` não apresenta falha de conexão com o Hub;
- se a ponte foi adicionada, um comando de teste recebe ACK sem criar alerta no relatório.

Se o cliente não aparecer, o dashboard permanecer offline ou o Doctor falhar, pare e peça ajuda antes de empacotar ou instalar no Quest.

Se não houver dependências do Hub instaladas, explique o requisito e não faça uma instalação ampla sem autorização.

## Rollback

Nunca restaure automaticamente. Depois de o usuário escolher o backup:

1. Confirme que o Unreal Editor está fechado.
2. Mostre exatamente quais caminhos serão substituídos.
3. Restaure `DefaultGame.ini` e o `.uproject` pelas cópias do backup.
4. Remova o plugin atual somente depois dessa confirmação.
5. Extraia `QuestSupervisor.zip` de volta para `<Projeto>/Plugins/QuestSupervisor`.
6. Execute novamente o verificador.

## Problemas comuns

- **Plugin não aparece:** confirme `Plugins/QuestSupervisor/QuestSupervisor.uplugin` e recompile o projeto.
- **Editor abre, mas não conecta:** confirme que o Hub está em `8787` e que o endpoint do Editor é `127.0.0.1:8787`.
- **Quest não conecta:** PC e headset precisam estar na mesma rede; firewall e IP LAN devem ser verificados.
- **Comandos sem ACK:** adicione a ponte ao mapa ou implemente o componente no Blueprint; mantenha `bAutoAckCommands=False` em integração real.
- **Versão diferente da Unreal:** interrompa e peça confirmação antes de usar `-AllowUntestedEngineVersion`.
- **Falha durante atualização:** preserve o diretório de backup e use o fluxo de rollback somente após confirmação.
