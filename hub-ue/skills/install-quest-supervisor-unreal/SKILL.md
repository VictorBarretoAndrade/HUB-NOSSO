---
name: install-quest-supervisor-unreal
description: Instala, atualiza, configura e valida o plugin QuestSupervisor do Biofeedback Hub em projetos Unreal Engine locais no Windows. Use quando o usuário quiser preparar um projeto Unreal para conectar ao Hub no Editor ou no Meta Quest; não use para desenvolver o plugin nem para fazer deploy Android sem solicitação explícita.
---

# Instalar Quest Supervisor no Unreal

Prepare o projeto consumidor com a versão validada do QuestSupervisor, preservando configurações e deixando evidência clara do resultado.

## Antes de alterar

1. Obtenha o caminho exato do projeto ou do arquivo `.uproject`. Se o usuário não souber encontrá-lo, peça a pasta que ele abre no Unreal, procure o arquivo automaticamente e mostre o caminho encontrado antes de continuar. Confirme que existe apenas um projeto quando uma pasta for informada.
2. Leia `EngineAssociation`, o mapa padrão, a configuração atual e a versão de qualquer QuestSupervisor já instalado.
3. Confirme que nenhum `UnrealEditor` ou `UnrealEditor-Cmd` está em execução. Não encerre esses processos sem autorização.
4. Prefira um clone local limpo do `hub-ue` informado pelo usuário. O helper verifica se os arquivos do plugin correspondem ao commit `bcb99ddb95c15b6a36d7494e30d4799ffe38bc73`; se não corresponderem, ofereça o download fixado. Sem clone, mostre primeiro a prévia sem download e solicite autorização antes da execução real com `-AllowDownload`.
5. Para versões da Unreal diferentes da 5.7, informe que não foram validadas e só prossiga após confirmação explícita, usando `-AllowUntestedEngineVersion`.

Leia [references/integration-workflow.md](references/integration-workflow.md) antes de executar uma instalação, atualização, rollback ou validação ao vivo.

## Instalação segura

Use `scripts/install_quest_supervisor.ps1`. Execute primeiro com `-WhatIf`, apresente projeto, origem, destino, versão, endpoint e mapa detectado, e peça confirmação antes da execução real.

- Editor: use `-Target Editor`; o endpoint padrão é `127.0.0.1:8787`.
- Quest: use `-Target Quest -Endpoint <ip-lan>:8787`; loopback e URLs com protocolo são rejeitados.
- `-Target Quest` apenas prepara o plugin e o endpoint. Build Android, instalação por ADB e abertura do aplicativo continuam separados e só podem ocorrer após pedido explícito.
- Nunca passe token na linha de comando. O instalador preserva `AuthToken` existente sem exibi-lo.
- Se já existir plugin ou configuração, o helper cria backup em `Saved/CodexBackups/QuestSupervisor/` antes de substituir arquivos.
- O helper usa o instalador e o verificador oficiais do repositório. Não copie arquivos com comandos improvisados.

## Ponte de comandos

Não execute `tools/unreal/place_supervisor_bridge.py` em projetos novos: ele fixa `/Game/VRTemplate/VRTemplateMap`.

Mostre o mapa padrão detectado e oriente o usuário a abrir esse mapa, adicionar `QuestSupervisorCommandBridgeActor` pelo Editor e salvar. Não altere mapa, Blueprint ou asset sem o usuário escolher o alvo e confirmar explicitamente.

## Validação

1. Execute o verificador oficial após a instalação.
2. Confirme separadamente que o `VersionName` instalado é igual ao da origem. O helper já faz essa comparação, pois o verificador oficial não a realiza.
3. Verifique se o projeto é C++ ou somente Blueprint. O plugin contém C++, portanto confirme a presença do Visual Studio 2022/Build Tools com a carga **Desenvolvimento de jogos com C++** antes de tentar compilar um projeto sem ambiente C++ preparado.
4. Se houver target C++ e Unreal 5.7 instalada, ofereça a compilação do target Editor.
5. Inicie Hub e dashboard somente com autorização e registre os PIDs criados.
6. Peça ao operador para abrir o projeto e pressionar Play.
7. Confirme um cliente `unreal-*` em `/status` e execute `biofeedback-doctor`.
8. Encerre somente os processos iniciados nesta validação.

O fluxo padrão termina no Editor. Empacotamento Android, ADB e deploy no Quest são opcionais e exigem pedido específico.

## Resultado

Informe versão e fonte instaladas, projeto, endpoint, modo Editor/Quest, backup criado, mapa sugerido e resultado das verificações. Em caso de falha, mantenha o backup e ofereça rollback; não o aplique automaticamente.
