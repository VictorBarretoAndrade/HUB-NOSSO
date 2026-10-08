# Especificação de gráficos de telemetria Unreal no Hub

## Objetivo

Especificar como o Hub e o dashboard devem gerar gráficos usando telemetria enviada pela Unreal via WebSocket, além dos gráficos biométricos já existentes.

A proposta parte dos dados do fluxo `unreal.state`: tempo de experiência, FPS da aplicação, temperatura da bateria no Quest, RTT WebSocket, perda de respostas de probes e estado da Unreal. O objetivo é dar observabilidade experimental sem apresentar placeholders como medições reais.

## Fundamentação

A coleta de biofeedback não depende apenas dos sensores biométricos. Durante um teste em VR, uma queda de FPS, aquecimento do headset, instabilidade de comunicação ou mudança de estado da Unreal pode explicar variações na experiência e nos dados coletados.

Por isso, o dashboard deve permitir comparar, em uma mesma janela de tempo:

- eventos de ciclo da experiência;
- markers;
- dados biométricos;
- telemetria técnica da Unreal.

## Evidência no código atual

O canal base já existe no projeto:

- A Unreal publica estado no tópico `unreal.state`.
- O plugin publica telemetria automática V2 com contexto de execução e disponibilidade por métrica.
- O FPS usa uma janela de um segundo; RTT e perda usam probes de aplicação `system.ping` / `system.pong`.
- Bateria e temperatura são consultadas somente no Android. CPU e GPU permanecem explicitamente indisponíveis.
- O dashboard usa `availability` como fonte autoritativa e mantém telemetria antiga visível como legado não verificado.

Arquivos usados como referência:

- `unreal/Plugins/QuestSupervisor/Source/QuestSupervisor/Public/QuestSupervisorTypes.h`
- `unreal/Plugins/QuestSupervisor/Source/QuestSupervisor/Private/QuestSupervisorSubsystem.cpp`
- `apps/dashboard/src/experienceAnalytics.ts`
- `docs/protocol.md`

## Escopo MVP/V0

No MVP/V0, o Hub/dashboard deve priorizar os gráficos que ajudam a validar a qualidade mínima do teste e a rastreabilidade técnica da sessão.

### 1. Tempo de experimento

Campo canônico: `telemetry.experienceElapsedSec`. O eixo X continua sendo derivado do lifecycle observado pelo dashboard.

Tipo: número.

Unidade: segundos.

Uso no gráfico: eixo X dos gráficos de telemetria da Unreal.

Impacto: permite alinhar FPS, temperatura, latência, perda de pacote, estado da Unreal, markers e biometria dentro da mesma sessão.

### 2. FPS

Campo esperado: `telemetry.fps`.

Tipo: número.

Unidade: frames por segundo.

Uso no gráfico: linha temporal de FPS durante a experiência.

Impacto: ajuda a identificar quedas de performance que podem afetar a experiência no óculos e a interpretação dos dados coletados.

### 3. Temperatura da bateria

Campo canônico: `telemetry.batteryTemperatureC`. `telemetry.temperatureC` permanece como alias legado.

Tipo: número.

Unidade: graus Celsius.

Uso no gráfico: linha temporal da temperatura da bateria reportada pelo Android durante a experiência.

Limite: essa leitura não representa temperatura do SoC, CPU, GPU, superfície ou headset inteiro. No Editor ela deve ser indisponível, nunca zero válido.

### 4. Latência de comunicação

Campo esperado: `telemetry.latencyMs`.

Tipo: número.

Unidade: milissegundos.

Uso no gráfico: linha temporal de RTT operacional WebSocket entre plugin Unreal e Hub, quando essa métrica estiver disponível.

Impacto: ajuda a diagnosticar atraso de comunicação que pode afetar sincronização de comandos, markers e leitura em tempo real.

Decisão técnica: no V0, `latencyMs` representa RTT operacional WebSocket entre plugin Unreal e Hub, medido por `system.ping` / `system.pong` e relógio monotônico no plugin. Ele não é latência fisiológica, de sensor, render-to-photon ou sincronização LSL.

Uso em pesquisa: `latencyMs` entra como metadado técnico/contextual de qualidade da sessão. Ele ajuda a interpretar instabilidade operacional, atraso de comunicação e perda de rastreabilidade, mas não substitui sinais biométricos e não deve ser tratado como variável fisiológica principal.

### 5. Perda de probes

Campo esperado: `telemetry.packetLossPct`.

Tipo: número.

Unidade: porcentagem.

Uso no gráfico: linha temporal da perda de respostas dos probes de aplicação.

Impacto: ajuda a identificar falhas de rede/WebSocket que podem causar buracos na telemetria ou perda de rastreabilidade durante a experiência.

Decisão técnica: o probe inicial de descoberta não entra no cálculo. O RTT fica disponível após a primeira resposta regular válida. Os probes regulares usam timeout de cinco segundos e janela móvel dos últimos 30 resultados resolvidos; a perda só fica disponível depois de cinco resultados, incluindo `100%` quando os cinco forem timeouts. Zero só é válido quando a telemetria V2 declara a métrica disponível. Ela não mede perda de pacote TCP em baixo nível.

Uso em pesquisa: `packetLossPct` deve ser usado como evidência técnica de confiabilidade da comunicação durante a experiência, não como medida direta de qualidade fisiológica ou de sincronização LSL.

### 6. Linha de estado da Unreal

Campos esperados: `payload.status` e, quando existir, `payload.state`.

Tipo: texto/categoria.

Unidade: não aplicável.

Valores esperados: `online`, `busy`, `idle`, `error`, `running`, `paused` ou equivalentes definidos pelo cliente Unreal.

Uso no gráfico: faixa discreta na timeline, mostrando quando a Unreal estava rodando, pausada, ociosa ou em erro.

Impacto: ajuda a explicar pausas, interrupções, mudanças de fase e momentos em que a coleta não deve ser interpretada como execução normal da experiência.

## Estrutura esperada do payload

Exemplo de publicação no tópico `unreal.state`:

```json
{
  "version": 1,
  "id": "message-id",
  "type": "publish",
  "topic": "unreal.state",
  "clientId": "unreal-Quest-3",
  "collectedAt": "2026-06-26T12:00:00.000Z",
  "sessionTimeMs": 12345,
  "payload": {
    "deviceId": "quest-3",
    "status": "online",
    "state": "running",
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
        "batteryTemperatureC": {"status": "available", "source": "android-battery"},
        "latencyMs": {"status": "available", "source": "websocket-application-probe"},
        "packetLossPct": {"status": "available", "source": "websocket-application-probe"}
      },
      "experienceElapsedSec": 12.345,
      "fps": 72,
      "batteryTemperatureC": 38.5,
      "latencyMs": 18,
      "packetLossPct": 0
    }
  }
}
```

## Proposta de exibição no dashboard

Os gráficos devem aparecer principalmente na aba de relatório da sessão, junto dos gráficos biométricos e dos markers. A leitura ideal é por tempo de experimento, para que a equipe consiga comparar o que aconteceu tecnicamente com o que aconteceu nos sensores.

Proposta de organização no MVP/V0:

- Card de resumo técnico com FPS médio/mínimo, temperatura máxima da bateria, RTT médio, maior perda de probes e último estado da Unreal.
- Gráfico de FPS por tempo.
- Gráfico de temperatura por tempo.
- Gráfico de latência por tempo.
- Gráfico de perda de probes por tempo.
- Faixa de estado da Unreal alinhada com a timeline, markers e pausas.

Os gráficos reutilizam o eixo temporal do lifecycle. Métricas V2 indisponíveis não produzem linhas ou estatísticas; a faixa mostra `Unavailable` e o motivo. Telemetria antiga permanece visível como `Legacy telemetry: availability unknown`, sem ser misturada às estatísticas verificadas quando houver dados V2.

## Status da implementação V0.3

A V0.3 consolida os gráficos de telemetria Unreal no dashboard/report e substitui zeros enganosos por disponibilidade explícita.

Arquivos principais:

- `apps/dashboard/src/experienceAnalytics.ts`
- `apps/dashboard/src/App.tsx`
- `apps/dashboard/src/styles.css`
- `apps/dashboard/src/experienceAnalytics.test.ts`

O dashboard lê os campos a partir de `payload.telemetry` e também aceita alguns campos no nível direto do payload para compatibilidade:

- `fps`
- `batteryTemperatureC` ou o alias legado `temperatureC`
- `latencyMs`
- `packetLossPct`
- `state`
- `status`

O relatório renderiza:

- resumo técnico da telemetria Unreal;
- linhas temporais de `Application FPS`, `Battery temperature`, `WebSocket RTT` e `Probe loss`;
- faixa de estado da Unreal;
- contagem de mensagens `unreal.state`;
- indicação de agregação quando houver muitos pontos.

Cada amostra analítica preserva `sourceClientId` e o campo canônico `batteryTemperatureC`. Se mais de um cliente Unreal publicar no mesmo run, o relatório usa somente a fonte observada mais recentemente e informa essa escolha na interface. A mesma fonte determina estados e intervalos de pausa usados pelo relógio analítico, impedindo que o Editor desloque a timeline do Quest. Os eventos de todas as fontes continuam preservados no JSONL bruto.

As estatísticas exportam também as contagens de amostras V2, legadas e válidas por métrica, deixando explícito o denominador usado em cada resumo.

O contexto `platform` e `executionMode` diferencia Editor/PIE de Android/Packaged. O relatório exibe essa origem e não interpreta bateria ou temperatura indisponível no Editor como valor zero.

O lifecycle usado para delimitar os gráficos é autoritativo no Runtime do Hub. `/status.experienceLifecycle.activeRunId` permite detectar um run que permaneceu aberto após desconexão ou recarga do dashboard. A recuperação publica `experience.lifecycle ended` com `reason: "operator-recovery"`, preserva os eventos e relatórios anteriores e não inicia outra experiência automaticamente. Se o eco se perder, a UI só libera a próxima ação quando o Runtime estiver sem run ativo e o Sensor Manager sem sensores anexados. O plugin Unreal correlaciona erros de `started` e `ended`: descarta um início rejeitado e mantém a experiência aceita quando o encerramento é recusado pelo Hub.

## Pós-MVP

As métricas abaixo são úteis, mas podem ficar para uma etapa posterior depois que os gráficos mínimos de observabilidade estiverem funcionando.

### Bateria do óculos

Campo esperado: `telemetry.batteryPct`.

Unidade: porcentagem.

Motivo para pós-MVP: é útil para contexto operacional, mas não é tão central quanto FPS, temperatura, latência, perda de pacote e estado para validar a qualidade imediata da sessão.

### Memória usada

Campo esperado: `telemetry.memoryMb`.

Unidade: megabytes.

Motivo para pós-MVP: ajuda a investigar vazamento ou crescimento de uso de memória, mas pode ser tratado como análise técnica mais avançada.

### CPU e GPU

Campos esperados: `telemetry.cpuPct` e `telemetry.gpuPct`.

Unidade: porcentagem.

Motivo para pós-MVP: pode explicar gargalos de renderização, mas exige validar a confiabilidade desses números no Quest antes de usá-los como métrica principal.

Na telemetria automática V2 atual, ambos são publicados com `status: unavailable` e `reason: not-implemented`.

### Correlação entre biometria e telemetria Unreal

Exemplos:

- FPS vs. HRV;
- temperatura vs. FPS;
- markers vs. picos de latência;
- perda de pacote vs. lacunas de amostras.

Motivo para pós-MVP: depende dos gráficos básicos e de uma exportação consistente por sessão.

### Alertas automáticos de qualidade técnica

Exemplos:

- FPS abaixo de um limite definido;
- temperatura acima de um limite definido;
- latência alta;
- perda de pacote acima de zero por muitos segundos;
- estado `error` durante a experiência.

Motivo para pós-MVP: os alertas ficam mais confiáveis depois que os gráficos e os thresholds forem validados em sessões reais.

## Critério de aceite

A tarefa pode ser considerada concluída quando:

- uma pessoa da equipe consegue entender quais dados a Unreal deve enviar;
- cada campo inicial tem nome, tipo e unidade definidos quando aplicável;
- existe exemplo de payload para o tópico `unreal.state`;
- o escopo MVP/V0 está separado do pós-MVP;
- o dashboard tem proposta clara de onde exibir os gráficos;
- os gráficos MVP/V0 permitem avaliar tempo de experimento, FPS, temperatura da bateria, RTT WebSocket, perda de probes e estado da Unreal;
- a equipe consegue usar esses gráficos para decidir se uma sessão teve qualidade técnica mínima para análise.

## DoD / Como validar

- Anexar este documento na tarefa.
- Confirmar que a Unreal publica `unreal.state` com `payload.telemetry`.
- Confirmar que os campos MVP/V0 aparecem no JSONL da sessão quando disponíveis.
- Confirmar que `system.ping` e `system.pong` não aparecem no JSONL nem criam ACK pendente.
- Confirmar que métricas indisponíveis não geram linhas ou estatísticas falsas.
- Confirmar que o dashboard consegue ler os campos e desenhar as séries temporais.
- Executar uma sessão de teste e verificar se os gráficos ficam alinhados com markers e lifecycle.
- Simular um run órfão, encerrá-lo por **End pending run** e verificar que um novo run exige outro clique.
- Exportar o relatório da sessão contendo os dados técnicos ou referência ao JSONL bruto.
