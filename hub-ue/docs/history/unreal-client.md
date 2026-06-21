# Histórico de migração do cliente Unreal

Este arquivo registra a evolução do cliente Unreal. Ele é uma memória técnica do projeto, não o guia principal de instalação.

Para aplicar o plugin em outro projeto Unreal, use:

```text
docs/unreal-project-integration.md
```

## Fonte canônica

O plugin ativo fica em:

```text
unreal/Plugins/QuestSupervisor
```

Projetos consumidores devem copiar essa pasta para:

```text
<ProjetoUnreal>/Plugins/QuestSupervisor
```

## Decisão inicial

O primeiro alvo Unreal foi uma camada de compatibilidade, não uma reescrita profunda. A estratégia foi manter o formato público do subsystem e trocar a construção/leitura dos envelopes JSON.

## Mapeamento do protocolo antigo para o atual

- `device.register` virou `hello`.
- `device.heartbeat` virou `publish` em `unreal.state`.
- `device.log` virou `publish` em `logger.events`.
- `server.command` virou `publish` em `unreal.commands`.
- `device.command.ack` virou `ack` genérico.

## O que foi preservado

- conexão WebSocket;
- loop de reconnect;
- fila de saída;
- heartbeat;
- delegates para Blueprint/C++;
- helpers de ACK;
- leitura de configuração;
- telemetria Android de bateria/temperatura.

## Sprint 1: robustez do plugin

Foram adicionados controles de execução:

- `bSupervisorEnabled`: liga/desliga o transporte sem remover o plugin.
- `bAutoAckCommands`: quando `true`, o plugin aceita comandos automaticamente; quando `false`, o jogo precisa chamar `AcceptCommand` ou `RejectCommand`.
- `HeartbeatIntervalSeconds`: intervalo de heartbeat.
- `InitialReconnectDelaySeconds` e `MaxReconnectDelaySeconds`: backoff de reconnect.
- `AuthToken`: token local anexado à URL WebSocket e ocultado nos logs.

## Sprint 2: ACK manual no host

O projeto `unreal/QuestSupervisorHost` passou a usar `bAutoAckCommands=False`.

Política de exemplo:

- `pause-session`: aceito.
- qualquer outra ação: rejeitada.

Isso validou os dois caminhos de ACK sem adicionar lógica de gameplay real.

## Sprint 3: validação no TesteVR

O fluxo manual foi aplicado ao projeto externo:

```text
C:\Users\LucasG\Documents\Unreal Projects\TesteVR
```

Resultado validado no Meta Quest 3:

- cliente conectado ao hub;
- `pause-session` retornou `accepted`;
- `unknown-action` retornou `rejected`.

## Sprint 4: integração orientada a Blueprint

O plugin passou a controlar o startup genérico. Projetos consumidores não precisam mais implementar bootstrap WebSocket no próprio `GameInstance`.

Peças adicionadas:

- `UQuestSupervisorSettings`: expõe `Edit > Project Settings > Plugins > Quest Supervisor`.
- `bAutoConnectOnStartup`: inicia o subsystem durante o startup.
- `SupervisorEndpoint`: endpoint canônico para Editor e Quest.
- campos de identidade: `DeviceId`, `DeviceLabel`, `AppId`, `AppVersion`, `HeadsetModel`.
- `UQuestSupervisorComponent`: componente Blueprint que repassa eventos e expõe `AcceptCommand` / `RejectCommand`.
- `AQuestSupervisorCommandBridgeActor`: Actor pronto para colocar no mapa e testar comandos sem C++ no projeto consumidor.

Fluxo recomendado:

1. Copiar `unreal/Plugins/QuestSupervisor` para `<ProjetoUnreal>/Plugins/QuestSupervisor`.
2. Configurar `Plugins > Quest Supervisor` no Project Settings.
3. Ativar `Auto Connect On Startup`.
4. Usar `Auto Ack Commands = false` em projetos reais.
5. Colocar `QuestSupervisorCommandBridgeActor` no mapa ou criar um Blueprint próprio com `QuestSupervisorComponent`.

## Estado atual

As APIs antigas continuam disponíveis para integrações avançadas:

- `ConfigureSupervisorEndpoint`
- `RegisterDevice`
- `SendHeartbeat`
- `SendLogEntry`
- `AcceptCommand`
- `RejectCommand`

O caminho comum, porém, deve ser configuração + Blueprint/Actor do plugin.
