# Biofeedback Hub Dashboard

Console operacional local-first para observar o hub Python, clientes conectados, topicos, ACKs pendentes e diagnostico basico.

## Rodar em desenvolvimento

Na raiz do repositorio:

```powershell
npm install
npm run dev:dashboard
```

O Vite abre em:

```text
http://127.0.0.1:5173
```

Por padrao, o dashboard tenta conectar no hub em:

```text
http://127.0.0.1:8787
```

Esse endpoint pode ser alterado na tela **Diagnostics**. O token e opcional e fica salvo apenas no `localStorage` do navegador.

## Escopo do MVP

- `Overview`, `Clients` e `Diagnostics` usam dados reais de `/health` e `/status`.
- `Topics` abre WebSocket como cliente `dashboard-ui`, assina os topicos oficiais e mostra eventos recebidos desde a abertura da tela.
- `Session Control` envia `pause-session`, `resume-session` e `add-marker` para `unreal.commands` com `requiresAck=true`; `Calibrate` continua bloqueado ate virar contrato real.
- O dashboard interpreta `unreal.state` como estado observado da sessao. `payload.state=running/paused/error` tem prioridade; quando o plugin real publica apenas `status`, `idle` vira `paused`, `online/busy` vira `running` e `error` vira `error`.
- `pause-session` e `resume-session` tem duas confirmacoes na UI: ACK `accepted` mostra que o cliente aceitou o comando; `unreal.state=paused/running` mostra que o stream confirmou o estado observado.
- `add-marker` tem duas confirmacoes na UI: ACK `accepted` mostra que o cliente aceitou o comando; `experience.marker` mostra que o marker entrou na timeline. O marker nao altera `running/paused`.
- `experience.lifecycle` vindo do Unreal/Blueprint pode iniciar e finalizar automaticamente a experiencia analitica. Os botoes locais **Start experience** e **End experience** continuam como fallback.
- `Session Control` tambem mostra uma timeline operacional com lifecycle, mudancas de `unreal.state` e markers de `experience.marker`. `Overview` mantem apenas o estado atual e o ultimo marker para reduzir ruido.

## Fluxo recomendado para uma sessao real

1. Conecte o hub, o Unreal real e qualquer sensor WebSocket que publique telemetria biometrica.
2. Em **Diagnostics**, confirme o endpoint do hub usado pela experiencia.
3. Em **Clients**, confirme o Unreal inscrito em `unreal.commands` e o Watch publicando `hrv.raw`.
4. Em **Session Control**, clique em **Start experience** ou acione o node Blueprint **Start Experience** dentro do Unreal.
5. Durante a experiencia, use **Pause session**, **Resume session** e **Add marker** conforme necessario. Markers enviados por Blueprint tambem entram na timeline.
6. Ao terminar, clique em **End experience** ou acione o node Blueprint **End Experience**. O dashboard abre a subtab **Report** automaticamente.
7. Revise **Report health**, grafico, marker callouts, biometrics summary e command issues.
8. Exporte os arquivos necessarios antes de clicar em **Start next experience**.

O Report e local ao navegador. Ele usa apenas eventos recebidos por este dashboard e restaurados do `localStorage`; outro browser ou computador nao tera o mesmo historico.

## Exports do Report

- **Report JSON**: envelope `schemaVersion: 1` com `summary`, `report`, `analytics`, `timeline`, `commandHistory` e `sensors`. Use para arquivamento completo local.
- **Markers CSV**: uma linha por marker, com tempo da experiencia, label, note, source, BPM/RR/signal do snapshot e `commandId` quando existir.
- **Biometrics CSV**: resumo por sensor, com samples, BPM min/medio/max, RR medio, IBI total, gaps e sinal ruim.
- **Biometrics Timeline CSV**: amostras biometricas no eixo de tempo da experiencia. Nao exporta arrays brutos de `ibiMs`.
- **Timeline CSV**: eventos analiticos de marker/state/biometric observados na experiencia.
