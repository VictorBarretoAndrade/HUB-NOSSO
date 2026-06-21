# Biofeedback Hub

Hub Python local para mensagens de biofeedback por tópicos.

## Instalação

Na raiz do repositório:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e apps\hub
```

## Execução

```powershell
.\.venv\Scripts\biofeedback-hub
```

Por padrão, o hub escuta em `0.0.0.0:8787` e expõe:

- `GET /health`
- `GET /status`
- `WebSocket /ws`

Qualquer dispositivo que consiga enviar JSON por WebSocket pode conectar em `/ws`. O `hello` aceita `role`, `capabilities`, `displayName`, `deviceType` e `metadata` livres; mensagens `publish` podem usar tópicos conhecidos ou novos, como `imu.accelerometer.raw`.

## Simuladores

```powershell
.\.venv\Scripts\biofeedback-sim --mode logger
.\.venv\Scripts\biofeedback-sim --mode hrv
.\.venv\Scripts\biofeedback-sim --mode eeg
.\.venv\Scripts\biofeedback-sim --mode unreal
.\.venv\Scripts\biofeedback-sim --mode multi-sensor
```

O modo `multi-sensor` abre cinco clientes WebSocket simulados no mesmo processo: HRV, ECG, IMU, temperatura e qualidade do ar. Para ver esses dados no dashboard real:

1. Suba o hub:

```powershell
.\.venv\Scripts\biofeedback-hub
```

2. Suba o dashboard na raiz do repositorio:

```powershell
npm run dev:dashboard
```

3. Em outro terminal, conecte os sensores simulados:

```powershell
.\.venv\Scripts\biofeedback-sim --mode multi-sensor
```

4. Abra `http://127.0.0.1:5173`, alterne o sensor no seletor **Viewing** da **Operational Overview** e use **Save JSON** ou **Export JSON** para baixar as amostras recebidas.

## Envio de comando para Unreal

```powershell
.\.venv\Scripts\biofeedback-command --action pause-session --arg reason=operator
.\.venv\Scripts\biofeedback-command --action resume-session --arg reason=operator
.\.venv\Scripts\biofeedback-command --action add-marker --arg reason=operator --arg markerId=marker-cli-1 --arg label=stimulus-start --arg note="first block"
```

O comando é publicado em `unreal.commands` com `requiresAck: true`. O CLI imprime o envelope enviado e, em seguida, o ACK retornado por um cliente Unreal real ou pelo simulador. O simulador Unreal tambem publica `experience.lifecycle=started` ao conectar, `unreal.state=paused` depois de aceitar `pause-session`, `unreal.state=running` depois de aceitar `resume-session`, e `experience.marker` depois de aceitar `add-marker` com `label`, para que o dashboard consiga diferenciar lifecycle, ACK, estado observado e marker observado.

## Status local

```powershell
.\.venv\Scripts\biofeedback-status
```

Esse comando lista clientes conectados, tópicos assinados e ACKs pendentes. Antes de enviar comandos para Unreal, confirme se existe um cliente inscrito em `unreal.commands`.

## Diagnóstico rápido

```powershell
.\.venv\Scripts\biofeedback-doctor
```

O `doctor` consulta `/health` e `/status`, mostra se o hub está online, destaca clientes inscritos em `unreal.commands` e sugere subir o hub quando ele estiver offline.
