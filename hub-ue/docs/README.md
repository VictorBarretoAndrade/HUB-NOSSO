# Documentação do projeto

Este diretório separa o caminho principal de uso, as referências técnicas e os registros históricos. A leitura recomendada depende do que você quer fazer.

## Quero rodar o hub local

Comece pelo [README raiz](../README.md) e, se quiser os comandos isolados do pacote Python, veja [apps/hub/README.md](../apps/hub/README.md).

Use estes docs quando precisar de mais contexto:

- [protocol.md](protocol.md): envelope WebSocket, tipos de mensagem, tópicos e ACK.
- [architecture.md](architecture.md): componentes do hub, broker, logs e plugin Unreal.

## Quero usar o plugin em um projeto Unreal

Leia [unreal-project-integration.md](unreal-project-integration.md). Ele é o guia principal para instalar, configurar e testar o plugin em um projeto consumidor.

Arquivos auxiliares:

- [templates/DefaultGame.Editor.ini](templates/DefaultGame.Editor.ini): exemplo para testes no Editor.
- [templates/DefaultGame.Quest.ini](templates/DefaultGame.Quest.ini): exemplo para Meta Quest físico.

## Quero manter o plugin

Leia [unreal-plugin-technical.md](unreal-plugin-technical.md). Ele descreve as classes principais, o fluxo de startup, o fluxo de comandos e as APIs preservadas para C++/Blueprint.

Use também:

- [architecture.md](architecture.md): visão geral dos limites entre hub e plugin.
- [protocol.md](protocol.md): contrato que o plugin precisa respeitar.

## Quero integrar sensores

Para conectar qualquer sensor ou dispositivo via WebSocket, leia [websocket-device-integration.md](websocket-device-integration.md).

Use tambem:

- [protocol.md](protocol.md): escolha do tópico e formato do envelope.
- [architecture.md](architecture.md): papel dos adapters e simuladores.
- [sensor-quality.md](sensor-quality.md): campos recomendados para qualidade de sinal e telemetria aberta.

## Quero entender arquitetura e protocolo

Leia nesta ordem:

1. [architecture.md](architecture.md)
2. [protocol.md](protocol.md)
3. [unreal-plugin-technical.md](unreal-plugin-technical.md)

## Quero entender o projeto e os próximos passos

Use [project-handoff.md](project-handoff.md). Ele resume o objetivo do projeto, arquitetura, estado atual, fluxos técnicos, responsabilidades de backend/frontend/Unreal e próximos passos para a equipe continuar o desenvolvimento.

## Quero consultar histórico, validações e releases

Esses arquivos preservam decisões e evidências, mas não são leitura inicial:

- [history/unreal-client.md](history/unreal-client.md): histórico de migração do cliente Unreal.
- [validation/quest3-test.md](validation/quest3-test.md): validação física no Meta Quest 3 usando `TesteVR`.
- [releases/](releases/): baselines de desenvolvimento e notas de versão.

## Onde colocar novas informações

- Guia de uso para projetos Unreal: `unreal-project-integration.md`.
- Detalhe interno do plugin: `unreal-plugin-technical.md`.
- Mudança no contrato WebSocket: `protocol.md`.
- Nova integração de sensor: um doc próprio em `docs/`, linkado na seção de sensores.
- Evidência de teste físico: `validation/`.
- Decisão histórica ou migração: `history/`.
- Registro de versão: `releases/`.
