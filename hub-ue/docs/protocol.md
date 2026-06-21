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
- `hubReceivedAt`: timestamp aplicado pelo hub ao receber a mensagem.
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
- `hrv.raw`
- `hrv.processed`
- `eeg.raw`
- `eeg.processed`
- `biofeedback.events`
- `ai.input`
- `ai.output`
- `logger.events`
- `system.events`

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

## Lifecycle da experiência

O tópico `experience.lifecycle` marca a janela analítica real da experiência XR. Ele é publicado pelo Unreal/Blueprint e observado pelo dashboard; não exige ACK.

Exemplo de início:

```json
{
  "type": "publish",
  "topic": "experience.lifecycle",
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
  "type": "publish",
  "topic": "experience.lifecycle",
  "payload": {
    "event": "ended",
    "runId": "run-1",
    "source": "xr",
    "reason": "completed"
  }
}
```

O dashboard usa `started` para iniciar a timeline analítica e `ended` para finalizar o Report quando o `runId` corresponde à experiência ativa. Os botões locais do dashboard continuam como fallback para desenvolvimento e sessões sem lifecycle XR.

## Status local

O hub expõe `GET /status` para inspeção local. A resposta inclui:

- clientes conectados;
- papéis, capabilities e tópicos assinados;
- ACKs pendentes;
- contagem de clientes e pendências.

## Extensões propostas (novas features — schemaVersion 2)

> Estado: **proposta/Fase 0**. Os contratos abaixo já existem como tipos
> (`apps/dashboard/src/{subjectProfile,captureProfile,exportFormats}.ts`) e modelos
> Pydantic (`biofeedback_hub/schemas/capture.py`), mas a execução (gravação/export)
> ainda não está implementada. Ver `PLANO-NOVAS-FEATURES.md` e `docs/decisions-novas-features.md`.

### Subject + Capture no `experience.lifecycle`

O `started` passa a carregar, opcionalmente, o snapshot do sujeito (cadastro
pseudônimo) e o perfil de captura. Campos opcionais — clientes que não os enviam
continuam válidos.

```json
{
  "type": "publish",
  "topic": "experience.lifecycle",
  "payload": {
    "event": "started",
    "runId": "run-1",
    "label": "block A",
    "source": "dashboard",
    "reason": "ui",
    "subject": {
      "schemaVersion": 2,
      "subjectId": "S-2026-014",
      "demographics": { "ageYears": 27, "biologicalSex": "female", "measurementPosition": "sitting" },
      "confounders": { "caffeineHoursAgo": 3, "sleepHours": 6.5, "conditions": ["none"] },
      "consentAt": "2026-06-21T00:00:00.000Z"
    },
    "capture": {
      "schemaVersion": 2,
      "mode": "record",
      "rawEcg": true,
      "sensors": [{ "clientId": "polar-h10", "signals": ["ecg", "rr", "hr"] }]
    }
  }
}
```

`subjectId` é sempre pseudônimo; **dado pessoal identificável não trafega nem é
persistido** (LGPD).

### Controle de gravação (`/control` no driver)

Mensagem enviada pela ponte (`biofeedback-polarh10`) ao endpoint `ws://<driver>:8765/control`
ao receber `experience.lifecycle`. Não passa pelo hub.

```json
{
  "type": "recording",
  "action": "start",
  "runId": "run-1",
  "capture": {
    "schemaVersion": 2,
    "mode": "record",
    "rawEcg": true,
    "sensors": [{ "clientId": "polar-h10", "signals": ["ecg"] }]
  }
}
```

`action` é `start` ou `stop`. Enquanto `/control` não existir no driver, a ponte
deve rodar com `--disable-recording-control`.
