# Integracao generica de dispositivos WebSocket

O hub aceita clientes WebSocket de qualquer dispositivo que consiga enviar JSON. Sensores, wearables, gateways, celulares, microcontroladores e ferramentas de laboratorio usam o mesmo contrato: conectam em `/ws`, enviam um `hello` e publicam envelopes em topicos nomeados.

## Endpoint

Suba o hub no PC:

```powershell
.\.venv\Scripts\biofeedback-hub
```

Dispositivos na mesma rede devem usar o IP LAN do PC:

```text
ws://192.168.x.x:8787/ws
```

Se o hub estiver usando `BIOFEEDBACK_HUB_TOKEN` ou `BIOFEEDBACK_HUB_CLIENT_TOKENS`, envie o token como parametro `token` na URL ou no header `x-biofeedback-token`.

## Handshake

A primeira mensagem da conexao deve ser `hello`. O campo `role` e livre; use valores como `sensor`, `wearable`, `gateway`, `controller`, `dashboard` ou outro papel que descreva o dispositivo.

```json
{
  "version": 1,
  "type": "hello",
  "clientId": "imu-node-1",
  "payload": {
    "clientId": "imu-node-1",
    "role": "sensor",
    "displayName": "IMU Node 1",
    "deviceType": "imu",
    "capabilities": ["accelerometer", "gyroscope"],
    "metadata": {
      "contract": "imu.accelerometer.raw",
      "firmware": "1.0.0",
      "transport": "wifi-websocket"
    }
  }
}
```

Depois do `hello`, o cliente pode publicar em qualquer topico. Topicos conhecidos como `hrv.raw`, `eeg.raw` e `unreal.state` continuam existindo, mas o hub tambem aceita topicos novos como `imu.accelerometer.raw`, `temperature.raw` ou `lab.device.telemetry`.

Para topicos novos fora da lista conhecida do dashboard, informe o topico publicado em `metadata.contract` ou em `metadata.topics` no `hello`. O dashboard usa esses metadados para assinar dinamicamente o novo stream depois que o sensor aparece em `/status`.

```json
{
  "version": 1,
  "type": "publish",
  "topic": "imu.accelerometer.raw",
  "clientId": "imu-node-1",
  "collectedAt": "2026-04-30T12:00:00.000Z",
  "sessionTimeMs": 12345,
  "payload": {
    "x": 0.12,
    "y": -0.03,
    "z": 0.98,
    "unit": "g",
    "sequence": 42
  }
}
```

## Contrato `hrv.raw`

Use `hrv.raw` para amostras cardiacas brutas vindas de cinta, wearable, gateway ou simulador. O hub nao exige fabricante especifico; ele valida o envelope e preserva o payload recebido. O dashboard reconhece HRV por esse topico e pelos campos abaixo.

Campos obrigatorios no envelope:

- `type`: `publish`.
- `topic`: `hrv.raw`.
- `clientId`: identificador estavel do sensor, gateway ou simulador.
- `payload`: objeto JSON com pelo menos `bpm` ou `rrMs`.

Campos recomendados no envelope:

- `collectedAt`: timestamp ISO 8601 da coleta no sensor, quando disponivel.
- `sessionTimeMs`: tempo relativo da sessao/experiencia, quando o dispositivo conhecer esse relogio.

Campos do payload:

- `bpm` opcional, mas recomendado: batimentos por minuto. Obrigatorio se `rrMs` nao for enviado.
- `rrMs` opcional, mas recomendado: intervalo RR em milissegundos. Obrigatorio se `bpm` nao for enviado.
- `ibiMs` opcional: lista de intervalos IBI/RR brutos em milissegundos quando o dispositivo entregar lote.
- `hrStatus` opcional: codigo numerico de qualidade/status nativo do sensor; valores negativos indicam baixa confianca no dashboard.
- `sequence` opcional: contador monotonicamente crescente para detectar lacunas.
- `source` opcional: driver, app, firmware ou gateway que gerou a leitura.
- `device` opcional: identificador humano ou tecnico do dispositivo fisico.
- `unit` opcional: unidade do valor principal quando o payload tambem enviar `value`.

Exemplo valido para cinta ou simulador:

```json
{
  "version": 1,
  "type": "publish",
  "topic": "hrv.raw",
  "clientId": "hrv-strap-1",
  "collectedAt": "2026-04-30T12:00:00.000Z",
  "sessionTimeMs": 12345,
  "payload": {
    "bpm": 74,
    "rrMs": 810.81,
    "ibiMs": [808, 812],
    "hrStatus": 1,
    "sequence": 42,
    "source": "generic-hrv-websocket",
    "device": "Polar H10 Lab Strap"
  }
}
```

## Assinaturas

Clientes que querem receber eventos enviam `subscribe` com os topicos desejados:

```json
{
  "version": 1,
  "type": "subscribe",
  "clientId": "analytics-listener",
  "payload": {
    "topics": ["imu.accelerometer.raw", "hrv.raw"]
  }
}
```

O broker roteia mensagens por topico exato. Para escalabilidade operacional, prefira topicos previsiveis por dominio e sinal:

- `hrv.raw`
- `eeg.raw`
- `imu.accelerometer.raw`
- `imu.gyroscope.raw`
- `temperature.raw`
- `device.status`

## Status e diagnostico

`GET /status` lista todos os clientes conectados, incluindo `role`, `capabilities`, `displayName`, `deviceType`, `metadata`, assinaturas, horario de conexao e ultima atividade.

```powershell
.\.venv\Scripts\biofeedback-status
```

O hub nao guarda filas ilimitadas por dispositivo. Se um cliente cair, ele deve reconectar e voltar a publicar amostras atuais em vez de descarregar backlog antigo sem controle.
