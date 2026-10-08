# Integração Galaxy Watch 7 HR/IBI

Este MVP conecta um Galaxy Watch 7 diretamente ao Biofeedback Hub como cliente `sensor`. O app do relógio fica em `C:\Codex\samsung-watch` no ambiente local de desenvolvimento e publica callbacks de frequência cardíaca do Samsung Health Sensor SDK no tópico `hrv.raw`.

## Endpoint do hub

Suba o hub no PC:

```powershell
.\.venv\Scripts\biofeedback-hub
```

No app do relógio, use o IP LAN do PC em vez de `127.0.0.1`:

```text
ws://192.168.x.x:8787/ws
```

Se o hub estiver usando `BIOFEEDBACK_HUB_TOKEN` ou `BIOFEEDBACK_HUB_CLIENT_TOKENS`, informe o token correspondente no app. O app envia esse valor como parâmetro `token` na URL.

## Payload do relógio

Depois de abrir o WebSocket, o relógio envia `hello`:

```json
{
  "version": 1,
  "type": "hello",
  "clientId": "galaxy-watch-7",
  "payload": {
    "clientId": "galaxy-watch-7",
    "role": "sensor",
    "capabilities": ["heart-rate", "ibi", "samsung-health-sensor-sdk", "watch-direct-websocket"]
  }
}
```

Cada callback válido do Samsung Health Sensor SDK é publicado em `hrv.raw`:

```json
{
  "version": 1,
  "type": "publish",
  "topic": "hrv.raw",
  "clientId": "galaxy-watch-7",
  "collectedAt": "2026-04-26T12:00:00.000Z",
  "sessionTimeMs": 12345,
  "payload": {
    "bpm": 74,
    "rrMs": 810.81,
    "ibiMs": [808, 812],
    "hrStatus": 1,
    "sequence": 42,
    "source": "samsung-health-sensor-sdk",
    "device": "galaxy-watch-7"
  }
}
```

Enquanto estiver desconectado, o relógio descarta amostras em vez de acumular dados sem limite.

## Validação

Inicie um logger:

```powershell
.\.venv\Scripts\biofeedback-sim --mode logger
```

Comece o streaming no relógio e consulte o status:

```powershell
.\.venv\Scripts\biofeedback-status
```

Resultado esperado:

- `galaxy-watch-7` aparece com role `sensor`.
- O logger mostra mensagens `publish` em `hrv.raw`.
- Os logs JSONL da sessão contêm `galaxy-watch-7` e `samsung-health-sensor-sdk`.

Para desenvolvimento sem aprovação de parceiro Samsung, habilite o modo de desenvolvedor do Health Platform no relógio. O AAR do Samsung Health Sensor SDK precisa existir em `C:\Codex\samsung-watch\app\libs\samsung-health-sensor-api.aar` antes de gerar o APK usado no relógio.
