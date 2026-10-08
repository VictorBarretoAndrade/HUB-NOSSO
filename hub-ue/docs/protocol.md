# Protocolo do hub

Todas as mensagens WebSocket são objetos JSON validados como `MessageEnvelope`.

```json
{
  "version": 1,
  "id": "uuid",
  "type": "publish",
  "topic": "hrv.raw",
  "clientId": "hrv-sim",
  "correlationId": null,
  "requiresAck": false,
  "collectedAt": "2026-04-24T12:00:00.000Z",
  "hubReceivedAt": null,
  "sessionTimeMs": 12345,
  "payload": {}
}
```

## Envelope

- `version`: versão do envelope.
- `id`: identificador único da mensagem.
- `type`: tipo da mensagem.
- `topic`: tópico usado em mensagens `publish`.
- `clientId`: cliente que enviou a mensagem.
- `correlationId`: referência à mensagem original, usada principalmente em ACK.
- `requiresAck`: indica se a mensagem precisa de confirmação.
- `collectedAt`: timestamp de coleta no sensor/dispositivo, quando existir.
- `hubReceivedAt`: timestamp autoritativo aplicado pelo Hub ao processar a mensagem. Qualquer valor enviado pelo cliente é substituído.
- `sessionTimeMs`: tempo relativo da sessão/experiência.
- `payload`: conteúdo específico da mensagem.

## Tipos de mensagem

- `hello`: primeira mensagem depois da conexão WebSocket.
- `subscribe`: assina tópicos; payload contém `{ "topics": ["hrv.raw"] }`.
- `unsubscribe`: remove assinaturas; payload contém `{ "topics": ["hrv.raw"] }`.
- `publish`: publica em um tópico; exige `topic`.
- `ack`: confirma ou rejeita uma mensagem crítica.
- `error`: enviado pelo hub quando uma mensagem não pode ser aceita.

## Hello de dispositivo

O `hello` identifica qualquer cliente WebSocket. `role` e `capabilities` são strings livres; use os valores conhecidos quando fizer sentido, mas o hub também aceita dispositivos novos sem alterar código.

O `clientId` do envelope e o `payload.clientId` devem ser idênticos. Em uma reconexão com o mesmo identificador, a conexão mais nova substitui a anterior; o encerramento tardio do socket antigo não remove a conexão atual.

```json
{
  "type": "hello",
  "clientId": "imu-node-1",
  "payload": {
    "clientId": "imu-node-1",
    "role": "sensor",
    "displayName": "IMU Node 1",
    "deviceType": "imu",
    "capabilities": ["accelerometer", "gyroscope"],
    "metadata": {
      "firmware": "1.0.0"
    }
  }
}
```

## Tópicos

Tópicos são strings abertas. A lista abaixo é o conjunto de tópicos conhecidos pelo projeto, não uma lista fechada:

- `experience.lifecycle`
- `experience.marker`
- `unreal.state`
- `unreal.commands`
- `sensor.commands`
- `sensor.status`
- `sensor.preview`
- `sensor.session`
- `lsl.raw`
- `hrv.raw`
- `hrv.processed`
- `eeg.raw`
- `eeg.processed`
- `biofeedback.events`
- `ai.input`
- `ai.output`
- `logger.events`
- `system.events`
- `system.ping`
- `system.pong`

Dispositivos podem publicar novos tópicos como `imu.accelerometer.raw`, `temperature.raw` ou `device.status`. Clientes interessados assinam exatamente os tópicos que querem receber.

## Comandos críticos

Comandos que exigem confirmação devem ser publicados com `requiresAck: true`.

```json
{
  "type": "publish",
  "topic": "unreal.commands",
  "requiresAck": true,
  "payload": {
    "action": "pause-session",
    "arguments": {
      "reason": "operator"
    }
  }
}
```

O comando `add-marker` usa o mesmo tópico e exige `arguments.label` não vazio. Quando aceito, o cliente publica também um evento em `experience.marker`.

```json
{
  "type": "publish",
  "topic": "unreal.commands",
  "requiresAck": true,
  "payload": {
    "action": "add-marker",
    "target": "all",
    "arguments": {
      "reason": "dashboard",
      "markerId": "marker-1",
      "label": "stimulus-start",
      "note": "first block"
    }
  }
}
```

Um cliente Unreal responde com:

```json
{
  "type": "ack",
  "correlationId": "original-message-id",
  "payload": {
    "messageId": "original-message-id",
    "status": "accepted"
  }
}
```

Valores esperados para `status`:

- `accepted`: o cliente recebeu e aceitou o comando.
- `rejected`: o cliente recebeu, mas recusou ou não suporta o comando.

O hub rastreia ACKs pendentes por destinatário. Quando um destinatário responde, o hub encaminha o `ack` ao publicador original, se ele ainda estiver conectado.

Exemplo de evento publicado após um marker aceito:

```json
{
  "type": "publish",
  "topic": "experience.marker",
  "payload": {
    "markerId": "marker-1",
    "commandId": "original-message-id",
    "label": "stimulus-start",
    "note": "first block",
    "source": "dashboard",
    "reason": "dashboard"
  }
}
```

Markers enviados diretamente pela experiencia Unreal/Blueprint devem usar `source: "xr"` por padrao. Markers criados a partir do comando `add-marker` do dashboard usam `source: "dashboard"` e carregam `commandId` para ligar o evento ao ACK do comando.

## Sensor Manager mínimo

A V0.3 adiciona um Sensor Manager local dentro do Hub. Ele controla sensores configurados, preview ao vivo e entrada oficial na sessão. Ele não implementa LSL real ainda.

Comandos de sensor usam o tópico único `sensor.commands`, com `requiresAck: true` e `payload.action`, seguindo o mesmo padrão de `unreal.commands`.

Ações mínimas:

- `sensor.scan`
- `sensor.connect`
- `sensor.disconnect`
- `sensor.session.arm`
- `sensor.session.disarm`
- `sensor.session.attach`
- `sensor.session.detach`

Exemplo de comando:

```json
{
  "type": "publish",
  "topic": "sensor.commands",
  "requiresAck": true,
  "payload": {
    "action": "sensor.connect",
    "target": "single",
    "arguments": {
      "sensorId": "sim-hrv-1"
    }
  }
}
```

Antes de existir um `runId`, o dashboard pode preparar um sensor conectado com `sensor.session.arm`. O comando não inicia gravação e não recebe `runId`:

```json
{
  "type": "publish",
  "topic": "sensor.commands",
  "requiresAck": true,
  "payload": {
    "action": "sensor.session.arm",
    "target": "single",
    "arguments": {
      "sensorId": "sim-hrv-1",
      "reason": "dashboard"
    }
  }
}
```

O armamento é one-shot e aparece em `/status` e `sensor.status` como `armedForNextRun: true`. O sensor continua no estado operacional `connected`, publicando apenas preview. A interface apresenta `Arm`/`Disarm` antes da sessão e `Attach`/`Detach` durante uma sessão ativa. `sensor.session.disarm` cancela a intenção de participar do próximo run.

O Sensor Manager também assina `experience.lifecycle`. No primeiro `started` válido, ele usa o `runId` recebido para anexar automaticamente todos os sensores armados. O runtime do Hub mantém o lifecycle autoritativo: repetições do mesmo `started` ou `ended` são idempotentes, enquanto um `runId` concorrente é rejeitado antes de entrar no log ou ser distribuído pelo broker. Assim, dashboard e Sensor Manager recebem a mesma decisão. O dashboard aguarda a confirmação do comando de armamento antes de liberar o início local. Os botões locais publicam o lifecycle pelo WebSocket monitorado e só consolidam `Running` ou `Ended` após receber o eco aceito pelo Hub. Se a confirmação expirar ou a conexão cair, a transição permanece incerta e qualquer repetição reutiliza o mesmo `runId`; uma divergência com `experienceLifecycle.activeRunId` vira conflito até a reconciliação. `sensorManager.activeRunId` permanece apenas como fallback de compatibilidade com Hubs antigos. Durante esse handoff, comandos de sensor ficam bloqueados. No `ended` correspondente, o Hub fecha imediatamente a entrada de novas amostras daquele run, faz detach automático e retorna os sensores para `connected`.

`sensor.session.attach` só é aceito quando o `runId` informado coincide com `/status.experienceLifecycle.activeRunId`. Antes de existir um lifecycle ativo, o cliente deve usar `sensor.session.arm`; um attach sem lifecycle ou apontando para outro run recebe ACK `rejected`. Como `start_recording` pode aguardar um dispositivo, o Sensor Manager confere o lifecycle novamente quando o adapter retorna. Se o run terminou ou mudou nesse intervalo, ele desfaz o início no adapter, não abre o gate de amostras, não publica `attached` e rejeita o comando. Repetir o attach do mesmo sensor para o mesmo run é idempotente enquanto o gate permanece aberto, inclusive no estado `stale`: o adapter não reinicia e um segundo evento `sensor.session attached` não é gravado.

Exemplo de attach:

```json
{
  "type": "publish",
  "topic": "sensor.commands",
  "requiresAck": true,
  "payload": {
    "action": "sensor.session.attach",
    "target": "single",
    "arguments": {
      "sensorId": "sim-hrv-1",
      "runId": "run-001",
      "reason": "dashboard"
    }
  }
}
```

O Sensor Manager publica `sensor.status` para estado operacional:

```json
{
  "type": "publish",
  "topic": "sensor.status",
  "clientId": "sensor-manager",
  "payload": {
    "event": "connected",
    "sensorId": "sim-hrv-1",
    "adapterId": "simulator",
    "source": "simulator",
    "state": "connected",
    "armedForNextRun": false,
    "deviceType": "hrv",
    "topics": ["hrv.raw"],
    "quality": "good",
    "recordingGateOpen": false,
    "freshness": {
      "status": "fresh",
      "ageMs": 125,
      "staleForMs": null,
      "staleAfterMs": 5000,
      "hasReceivedSample": true
    }
  }
}
```

Estados esperados: `configured`, `available`, `connecting`, `connected`, `recording`, `stale`, `error` e `disconnected`. `armedForNextRun` é uma intenção separada do estado operacional.

O campo aditivo `freshness` informa se o estado ainda é sustentado por amostras
recentes. Depois de cinco segundos sem amostra, por padrão, um sensor conectado
ou gravando passa uma única vez para `state: "stale"` e `quality: "stale"`.
Se ele estava attached, o gate oficial permanece aberto e o `runId` não muda:
o Hub não inventa amostras durante a lacuna e retoma o mesmo run quando a fonte
volta. A primeira nova amostra publica `event: "recovered"` e restaura
`connected` ou `recording`. Detach e disconnect continuam fechando o gate
imediatamente, inclusive enquanto o sensor está stale.

Para streams com `nominalSrateHz` positivo, o limite efetivo é o maior entre
cinco segundos e três períodos nominais. Isso evita classificar como stale um
sensor de baixa frequência que está operando dentro da taxa declarada. Um
sensor armado que se torne stale ainda pode ser attached ao iniciar o run; o
gate abre sem inventar dados e a primeira amostra real restaura `recording`.
Streams irregulares (`nominalSrateHz: 0`) não recebem timeout inferido pela
ausência de amostras; nesses casos, `freshness.staleAfterMs` é `null` e o estado
publicado pelo Hub permanece autoritativo para o dashboard.

O Sensor Manager publica `sensor.preview` para amostra ao vivo:

```json
{
  "type": "publish",
  "topic": "sensor.preview",
  "clientId": "sensor-manager",
  "payload": {
    "sensorId": "sim-hrv-1",
    "sourceTopic": "hrv.raw",
    "sequence": 1,
    "sample": {
      "bpm": 72,
      "rrMs": 833.3,
      "quality": "good"
    }
  }
}
```

Regra de persistência: `sensor.preview` passa pelo WebSocket para a UI, mas não entra no JSONL e não é dado oficial da sessão. Armar um sensor também não publica dados brutos. Dados como `hrv.raw` só são publicados pelo adapter gerenciado depois de `sensor.session.attach` com o `runId` do lifecycle ativo, manualmente durante a sessão ou automaticamente pelo lifecycle. O runtime rejeita amostras oficiais atrasadas de um `runId` que já recebeu `experience.lifecycle ended`.

Eventos `sensor.session` registram entrada e saída oficial do sensor. Arm/disarm usam apenas `sensor.status`; `sensor.session` continua reservado a `attached`/`detached` com `runId`. O dashboard preserva `Experience ended` e o `detached` automático no relatório mesmo quando chegam logo após o `endedAt` local, fixando ambos no limite final da timeline:

```json
{
  "type": "publish",
  "topic": "sensor.session",
  "clientId": "sensor-manager",
  "payload": {
    "event": "attached",
    "sensorId": "sim-hrv-1",
    "runId": "run-001",
    "topics": ["hrv.raw"]
  }
}
```

## Adapter LSL mínimo

A V0.4 adiciona providers de descoberta ao Sensor Manager. O provider LSL é
opcional: a ausência de `pylsl` não impede o Hub de iniciar e aparece em
`/status.sensorManager.providers`:

```json
{
  "providerId": "lsl",
  "state": "ready",
  "discoveredCount": 2,
  "supportedCount": 1,
  "unsupportedCount": 1,
  "lastScanAt": "2026-08-04T15:00:00Z"
}
```

Estados do provider: `ready`, `unavailable`, `disabled` e `error`. Streams de
formato textual e streams cujo tipo LSL seja `Marker` ou `Markers` são
contabilizados como não suportados, mas não viram sensores operacionais na
V0.4.

Cada stream numérico descoberto vira um sensor com `adapterId: "lsl"`,
`source: "lsl"` e tópico oficial `lsl.raw`. Em `/status`, `sensor.status` e
`sensor.session`, os metadados ficam dentro de `adapterStatus.stream`,
acompanhados de `adapterStatus.sync`:

```json
{
  "adapterStatus": {
    "stream": {
      "name": "Biofeedback Hub Test",
      "type": "TestSignal",
      "sourceId": "biofeedback-hub-test-v0-4",
      "uid": "outlet-instance-id",
      "host": "LAB-PC",
      "hostname": "LAB-PC",
      "channelCount": 2,
      "nominalSrateHz": 10,
      "channelFormat": "float32",
      "channels": [
        { "label": "signal", "unit": "a.u.", "type": "synthetic" },
        { "label": "phase", "unit": "a.u.", "type": "synthetic" }
      ]
    },
    "sync": {
      "status": "corrected",
      "timeCorrectionSec": 0.02,
      "timeCorrectionAgeSec": 0.4
    }
  }
}
```

O preview contém somente a amostra mais recente e o resumo do lote. O lote
completo só é publicado após attach:

```json
{
  "type": "publish",
  "topic": "lsl.raw",
  "clientId": "sensor-manager",
  "payload": {
    "sensorId": "lsl-a1b2c3d4",
    "runId": "run-001",
    "deviceType": "TestSignal",
    "source": "lsl",
    "stream": {
      "name": "Biofeedback Hub Test",
      "type": "TestSignal",
      "channelCount": 2,
      "nominalSrateHz": 10,
      "channelFormat": "float32"
    },
    "sampleCount": 1,
    "samples": [
      {
        "values": [0.25, 0.75],
        "lslTimestamp": 1234.5,
        "correctedLslTimestamp": 1234.52
      }
    ],
    "sync": {
      "status": "corrected",
      "timeCorrectionSec": 0.02
    }
  }
}
```

`lslTimestamp` preserva o valor do outlet. `correctedLslTimestamp` adiciona a
correção temporal estimada pelo inlet. Como o relógio LSL não usa época Unix,
`collectedAt` é estimado em UTC pelo deslocamento entre o relógio LSL local e o
relógio UTC do Hub no recebimento do lote. `hubReceivedAt` continua sendo o
horário operacional em que o Hub processou a mensagem. A V0.4 não aplica
dejitter nem monotonização.

O bloco `sync` usa `corrected` quando a correção foi atualizada, `stale` quando
uma tentativa transitória falhou mas ainda existe uma correção anterior, e
`warming-up` quando ainda não há correção confiável. `timeCorrectionAgeSec`
expõe a idade da última correção válida. Em `warming-up`, as amostras mantêm
`correctedLslTimestamp: null`; o Hub ancora a amostra mais recente no horário
UTC de chegada e preserva os intervalos relativos do lote em `collectedAt`, com
origem `arrival-utc-anchored-lsl-delta`. Uma reconexão descarta explicitamente
a correção antiga antes de aceitar uma nova.

Cada amostra também declara `collectedAtSource`. Se um lote combinar timestamps
válidos e inválidos, `sync.collectedAtSource` será `mixed`, enquanto cada item
indica se usou correção LSL, espaçamento relativo ou chegada UTC. Assim, uma
amostra em fallback não reclassifica silenciosamente as demais.

Quando fallback de amostra e falha de atualização temporal acontecem juntos,
`status: "fallback"` continua compatível com consumidores existentes e os
campos `correctionStatus` e `correctionReason` preservam separadamente o
diagnóstico da correção. Operações nativas de conexão, leitura, correção e
fechamento terminam de forma ordenada antes que um cancelamento feche o inlet.

As regras de lifecycle da V0.3 continuam autoritativas: `sensor.preview` nunca
é persistido, `lsl.raw` só entra no JSONL enquanto o gate do run está aberto e
amostras atrasadas são descartadas depois do encerramento.

Na abertura do gate LSL, o adapter conclui qualquer leitura nativa em andamento
e limpa o buffer anterior. O Sensor Manager captura a geração e o `runId` antes
de aguardar o próximo lote; por isso, amostras cuja espera começou antes do
attach permanecem somente no preview. No detach, a mudança de geração invalida
qualquer espera ainda em andamento antes que ela possa publicar dados oficiais.

O dashboard não assina `lsl.raw` no monitoramento padrão. Os cards usam
`sensor.preview`, `sensor.status` e `sensor.session`; o JSONL do Hub permanece a
fonte autoritativa para os lotes oficiais. Isso evita duplicar na interface um
stream de alta frequência que já está sendo persistido integralmente.
Durante um attach LSL, a aba Sensors mostra `LSL logging active` somente quando
o `recordingGateOpen` está verdadeiro e o estado é `recording` ou `stale`. Uma
falha que feche o gate remove o indicador, mesmo que o `attachedRunId` seja
preservado para recuperação operacional. Quando fallback e correção stale
coexistem, o card mantém os dois diagnósticos visíveis.

## Telemetria Unreal V2

O tópico `unreal.state` mantém o envelope na versão 1 e usa `payload.telemetry.schemaVersion: 2` para distinguir medições válidas de valores legados. `availability` é autoritativo: zero com `status: available` é uma medição real; `status: unavailable` não entra em gráficos nem estatísticas verificadas.

```json
{
  "type": "publish",
  "topic": "unreal.state",
  "clientId": "unreal-quest-3",
  "payload": {
    "status": "online",
    "telemetry": {
      "schemaVersion": 2,
      "context": {
        "source": "quest-supervisor-plugin",
        "origin": "automatic",
        "platform": "android",
        "executionMode": "packaged"
      },
      "availability": {
        "fps": {"status": "available", "source": "engine-frame-window"},
        "latencyMs": {"status": "available", "source": "websocket-application-probe"},
        "packetLossPct": {"status": "available", "source": "websocket-application-probe"},
        "batteryTemperatureC": {"status": "available", "source": "android-battery"},
        "experienceElapsedSec": {"status": "available", "source": "experience-lifecycle"},
        "supervisorUptimeSec": {"status": "available", "source": "monotonic-clock"},
        "cpuPct": {"status": "unavailable", "reason": "not-implemented"}
      },
      "fps": 71.8,
      "latencyMs": 18.4,
      "packetLossPct": 0,
      "batteryTemperatureC": 37.4,
      "experienceElapsedSec": 12.5,
      "supervisorUptimeSec": 18.2
    }
  }
}
```

Motivos conhecidos de indisponibilidade: `not-implemented`, `unsupported-platform`, `read-failed`, `warming-up`, `no-active-experience`, `probe-timeout` e `invalid-sample`.

Os campos planos antigos continuam presentes para compatibilidade. `temperatureC` é alias depreciado de `batteryTemperatureC`; `sessionElapsedSec` mantém a semântica de tempo do Supervisor. Payloads sem `schemaVersion: 2` são telemetria legada com disponibilidade não verificada. Heartbeats automáticos do plugin usam V2; payloads manuais de Blueprints sem um mapa `availability` explícito continuam sendo serializados como legados.

O FPS automático usa uma janela de aproximadamente um segundo. Deltas inválidos e pausas superiores a um segundo reiniciam o aquecimento da janela, evitando transformar retomadas do Editor ou do Quest em quedas artificiais de FPS.

## Lifecycle da experiência

O tópico `experience.lifecycle` marca a janela analítica real da experiência XR. Ele é publicado pelo Unreal/Blueprint e observado pelo dashboard; não exige ACK.

Exemplo de início:

```json
{
  "id": "lifecycle-start-run-1",
  "type": "publish",
  "topic": "experience.lifecycle",
  "clientId": "unreal-quest-3",
  "payload": {
    "event": "started",
    "runId": "run-1",
    "label": "block A",
    "source": "xr",
    "reason": "trigger-volume"
  }
}
```

Exemplo de fim:

```json
{
  "id": "lifecycle-end-run-1",
  "type": "publish",
  "topic": "experience.lifecycle",
  "clientId": "unreal-quest-3",
  "payload": {
    "event": "ended",
    "runId": "run-1",
    "source": "xr",
    "reason": "completed"
  }
}
```

O dashboard usa `started` para iniciar a timeline analítica e `ended` para finalizar o Report quando o `runId` corresponde à experiência ativa. Os botões locais do dashboard continuam como fallback para desenvolvimento e sessões sem lifecycle XR. Cada publicação do dashboard recebe um `id` próprio para correlacionar uma rejeição com a transição pendente.

O runtime do Hub é a autoridade sobre o lifecycle. `/status.experienceLifecycle.activeRunId` contém o run ativo ou `null`. Um `started` concorrente, ou um `ended` para outro run enquanto existe um run ativo, retorna diretamente ao remetente:

```json
{
  "type": "error",
  "clientId": "hub",
  "correlationId": "lifecycle-start-run-2",
  "payload": {
    "code": "lifecycle_conflict",
    "message": "Another experience run is active.",
    "detail": {
      "activeRunId": "run-1",
      "requestedRunId": "run-2",
      "requestedEvent": "started"
    }
  }
}
```

Tentar iniciar novamente um `runId` já encerrado retorna `lifecycle_already_ended`. Esses erros são efêmeros: não entram no JSONL e não são distribuídos a outros clientes. Dashboard e plugin Unreal correlacionam rejeições de `started` e `ended` por `correlationId`. Quando um `started` da Unreal é rejeitado, o plugin descarta o `runId` pendente para não tentar encerrar depois uma experiência que o Hub nunca aceitou; quando um `ended` é rejeitado, a experiência aceita permanece ativa até uma transição válida.

Se a página for recarregada ou uma confirmação for perdida, o dashboard compara o estado local com `experienceLifecycle.activeRunId`. Quando existe um run ativo incompatível, a interface bloqueia uma nova sessão e oferece **End pending run**. A ação exige confirmação do operador e publica o evento normal:

```json
{
  "id": "lifecycle-recovery-run-1",
  "type": "publish",
  "topic": "experience.lifecycle",
  "clientId": "dashboard-ui",
  "payload": {
    "event": "ended",
    "runId": "run-1",
    "source": "dashboard",
    "reason": "operator-recovery"
  }
}
```

O encerramento de recuperação é persistido normalmente, faz detach dos sensores do run e não apaga logs ou o relatório local anterior. Depois da confirmação, o dashboard aguarda um novo clique do operador; ele nunca inicia outra experiência automaticamente. Se o eco do `ended` se perder durante uma desconexão, o dashboard encerra a transição pendente somente quando `/status` informar `activeRunId: null` e nenhum sensor permanecer anexado. Se o run autoritativo mudar enquanto o modal estiver aberto ou durante a recuperação, a confirmação é recusada.

## Probes de comunicação Unreal-Hub

`system.ping` e `system.pong` medem RTT operacional WebSocket. São mensagens efêmeras: não entram no JSONL, não criam ACK pendente e não representam latência fisiológica, render-to-photon ou sincronização LSL.

```json
{
  "id": "id-do-system-ping",
  "type": "publish",
  "topic": "system.ping",
  "clientId": "unreal-quest-3",
  "payload": {"sequence": 42}
}
```

O Hub responde diretamente ao mesmo cliente autenticado:

```json
{
  "type": "publish",
  "topic": "system.pong",
  "clientId": "hub",
  "correlationId": "id-do-system-ping",
  "payload": {
    "sequence": 42,
    "pingHubReceivedAt": "2026-07-16T12:00:00.010Z",
    "hubRespondedAt": "2026-07-16T12:00:00.011Z"
  }
}
```

O primeiro ping após a conexão serve apenas para descobrir o suporte do Hub e não entra nas estatísticas. Depois dele, o plugin envia um probe a cada dois segundos, considera timeout após cinco segundos e calcula a perda sobre os últimos 30 resultados resolvidos. `latencyMs` fica disponível após a primeira resposta regular válida. `packetLossPct` só fica disponível após cinco resultados; probes ainda pendentes não entram no cálculo e cinco timeouts produzem uma perda válida de `100`.

O plugin calcula `latencyMs` com relógio monotônico local e ignora pongs atrasados, duplicados ou desconhecidos. `packetLossPct` representa perda de respostas de probes de aplicação; não é perda de pacotes TCP em baixo nível. Ao reconectar, probes e métricas de comunicação são reiniciados. `system.pong` é reservado ao Hub.

## Status local

O hub expõe `GET /status` para inspeção local. A resposta inclui:

- clientes conectados;
- papéis, capabilities e tópicos assinados;
- ACKs pendentes;
- contagem de clientes e pendências;
- `experienceLifecycle.activeRunId`, estado autoritativo do run ativo;
- `sensorManager.activeRunId`, mantido por compatibilidade e diagnóstico do módulo de sensores;
- `sessionLog.path`, arquivo JSONL da sessão;
- `sessionLog.pendingWrites` e `sessionLog.maxPendingWrites`, ocupação atual e limite da fila de escrita;
- `sessionLog.backgroundWrites`, indicando se o processo usa a fila assíncrona;
- `sessionLog.error`, último erro durável de persistência ou `null`.

## Integridade de entrega e ponte Polar

O identificador `clientId: "sensor-manager"` é reservado ao Sensor Manager
interno. Uma conexão WebSocket externa que tente assumir esse identificador é
rejeitada. Da mesma forma, `lsl.raw` só pode ser publicado pelo processo
interno; clientes externos recebem o erro `reserved_topic`. Isso impede que um
cliente contorne o gate de gravação oficial do adapter LSL.

O broker mantém uma outbox limitada por cliente. Mensagens confiáveis, como
lifecycle, comandos, estados, sessões e ACKs, permanecem em FIFO. Para um
dashboard, `hrv.raw`, `sensor.preview` e `unreal.state` podem ser compactados
para o valor mais recente por tópico e sensor, porque são dados de visualização;
essa compactação nunca altera o JSONL oficial. Um consumidor que exceda a fila
confiável é desconectado com o motivo `slow_consumer`. `/status` expõe tamanho,
limites, coalescência, descarte, overflow e motivo de fechamento da outbox.

O logger usa uma única fila limitada e um escritor dedicado. A ordem de entrada
é preservada, o encerramento faz `flush` e uma falha de disco deixa `/health`
degradado por meio de `sessionLogError`. Nenhuma compactação do broker é usada
na persistência.

Na ponte Polar, `payload.driverTimestamp` preserva o timestamp informado pelo
driver, `payload.bridgeReceivedAt` marca a chegada à ponte e
`payload.collectedAtSource` informa `driver-packet-timestamp` ou
`bridge-receipt-fallback`. `collectedAt` usa o timestamp do driver quando ele é
válido. Esse timestamp descreve a geração no driver; não deve ser interpretado
automaticamente como o instante físico de aquisição no relógio interno da
cinta. `hubReceivedAt` continua sendo medido pelo Hub.

`GET /health` mantém `service`, `sessionId` e `pendingAcks` e acrescenta
`pendingLogWrites` e `sessionLogError`. Os campos `ok` de `/health` e `/status`
ficam `false` quando o logger detecta falha de escrita, pois uma sessão sem log
durável não deve ser considerada saudável. Escritas ainda pendentes não tornam
o serviço não saudável por si só; elas são drenadas no encerramento normal.

## Contexto da coleta e markers do dashboard

Estas extensões são opcionais e retrocompatíveis: clientes que não as enviam continuam válidos. Os tipos correspondentes estão em `apps/dashboard/src/domain/{subjectProfile,captureProfile}.ts` e em `biofeedback_hub/schemas/capture.py`. O histórico das decisões está em `docs/decisions-novas-features.md`.

### `subject` e `capture` no `experience.lifecycle`

Quando o dashboard publica `started`, o payload carrega o perfil de captura e, se houver cadastro, o snapshot do sujeito. O evento `ended` não repete esses campos.

```json
{
  "event": "started",
  "runId": "run-1",
  "label": "Dashboard Experience",
  "source": "dashboard",
  "reason": "ui",
  "capture": {
    "schemaVersion": 2,
    "mode": "record",
    "rawEcg": true,
    "sensors": [{ "clientId": "polar-h10", "signals": ["ecg", "rr", "hr"] }]
  },
  "subject": {
    "schemaVersion": 2,
    "subjectId": "S-2026-014",
    "demographics": { "ageYears": 27, "biologicalSex": "female", "measurementPosition": "sitting" },
    "confounders": { "caffeineHoursAgo": 3, "sleepHours": 6.5, "conditions": [] },
    "consentAt": "2026-06-21T00:00:00.000Z",
    "updatedAt": "2026-06-21T00:00:00.000Z"
  }
}
```

`subjectId` é sempre um pseudônimo: dado pessoal identificável não trafega nem é persistido (LGPD). O hub transporta e registra esses campos no JSONL sem interpretá-los. A ponte `biofeedback-polarh10` encaminha `start`/`stop` ao `/control` do driver com `runId`, `label`, `reason` e `source`; ela ainda não repassa `capture`.

### `experience.marker` publicado pelo dashboard

O dashboard escolhe o caminho do marker conforme haja ou não um cliente inscrito em `unreal.commands`:

- **Com** cliente inscrito: publica o comando `add-marker` em `unreal.commands` com `requiresAck=true`. O marker entra na timeline quando o Unreal publica `experience.marker`.
- **Sem** cliente inscrito: o próprio cliente `dashboard-ui` publica em `experience.marker`, sem ACK.

```json
{
  "type": "publish",
  "clientId": "dashboard-ui",
  "topic": "experience.marker",
  "requiresAck": false,
  "payload": {
    "markerId": "5d6c...",
    "label": "stimulus-start",
    "note": "olhos fechados",
    "runId": "run-1",
    "source": "dashboard",
    "reason": "ui"
  }
}
```

`note` e `runId` são omitidos quando vazios. Os dois caminhos nunca são usados para o mesmo marker, o que evita duplicidade na timeline.

### ECG em `hrv.raw`

Um sensor pode incluir, além de `bpm` e `rrMs`, a janela de ECG do intervalo:

- `ecg`: array de amostras numéricas, em ordem cronológica;
- `ecgSampleRateHz`: taxa de amostragem do array.

O simulador gera esses campos com `biofeedback-sim --mode hrv-ecg` (o modo `hrv` envia só `bpm`/`rrMs`). A tela **Ao vivo** do dashboard desenha a waveform a partir de `ecg`.
