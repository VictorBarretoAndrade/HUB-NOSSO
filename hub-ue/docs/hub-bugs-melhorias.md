# Bugs criticos e melhorias do Hub

Data do mapeamento: 2026-06-16.

Escopo: Hub Python, dashboard local, plugin Unreal `QuestSupervisor`, fluxo Polar H10/HRV e logs JSONL. A classificacao abaixo separa o que pode comprometer a coleta MVP/V0 do que pode seguir para V1/V2/V3.

## Evidencias revisadas em 2026-06-16

Depois da primeira versao deste mapeamento, a pasta antiga `C:\Users\incit\Documents\hub-ue-main` foi revisada. Ela contem evidencias de teste com sensor real Polar H10:

- `data/sessions/session-20260602T131220Z.jsonl`: `polar-h10=2401`, `hrv.raw=2400`, `unreal.state=239`, `experience.lifecycle=6`, `experience.marker=3`.
- `data/sessions/session-20260602T140314Z.jsonl`: `polar-h10=1272`, `hrv.raw=1271`, `unreal.state=297`, `experience.lifecycle=6`, `experience.marker=7`.
- Os payloads `hrv.raw` trazem `source=polar-h10-driver`, `device=Polar H10`, `sequence`, `bpm`, `rrMs`, `ibiMs`, `rmssdMs`, `sdnnMs`, `pnn50` e `lfHf` quando disponiveis.
- A bridge da pasta antiga (`apps/hub/src/biofeedback_hub/integrations/polar_h10_bridge.py`) ja mapeia `packet.timestamp` para `collectedAt` e estima janela de amostras ECG com `firstSampleAt`, `lastSampleAt` e `sampleTimestampMode`.

Conclusao: sensor real e parte dos timestamps ja foram validados no historico do projeto. O risco atual nao e "sensor nunca testado"; e garantir que a versao nova desta pasta carregue a mesma bridge/correcao e que a evidencia seja anexada ao proximo registro de teste.

## Criterio usado

- **Critico para teste**: pode impedir conexao, captura, sincronizacao, exportacao ou leitura minima dos dados no proximo teste.
- **Ajuste importante**: nao bloqueia necessariamente o proximo teste, mas reduz confiabilidade, diagnostico ou reprodutibilidade.
- **Melhoria futura**: melhora produto, pesquisa ou escala, mas pode esperar V1/V2/V3.

## Decisao rapida para o proximo teste

Corrigir ou validar antes do proximo teste:

1. Confirmar `bAutoAckCommands=False` no projeto Unreal usado no teste e eliminar ACK duplicado/misleading.
2. Confirmar que a versao nova usa a bridge Polar H10 corrigida da pasta antiga, incluindo `packet.timestamp` em `collectedAt` e ECG em `ecg.raw`.
3. Reanexar ao proximo teste a evidencia historica de Polar H10 real e, se possivel, repetir um run curto ponta a ponta com a versao nova.
4. Fazer export do mesmo run completo: report JSON, CSV de markers e CSV/JSON de biometria.
5. Definir um checklist preflight com hub online, Unreal inscrito em `unreal.commands`, sensor streaming e dashboard recebendo eventos.

## Itens mapeados

| ID | Titulo | Categoria | Prioridade | Area | Impacto | Evidencia / rastreabilidade | Acao recomendada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HUB-001 | Evidencia de Polar H10 real existe na pasta antiga, mas precisa ser incorporada na versao nova | Critico para teste | P0 | Sensores, captura, exportacao | Se a versao nova nao portar a bridge/fluxo validado, a equipe pode repetir o teste sem ECG/HRV real ou sem rastreabilidade clara. | `hub-ue-main` contem `session-20260602T131220Z.jsonl` com `polar-h10=2401`, `hrv.raw=2400`, `unreal.state=239`, lifecycle e markers; `session-20260602T140314Z.jsonl` tem `polar-h10=1272`, `hrv.raw=1271`, `unreal.state=297`, lifecycle e 7 markers. | Portar/confirmar a bridge Polar H10 da pasta antiga nesta versao e anexar esses logs como evidencia historica. Aceite: sensor aparece em `/status`, amostras entram em `hrv.raw`/`ecg.raw`, JSONL registra os dados e o dashboard exporta biometria. |
| HUB-002 | ACK duplicado ou prematuro no Unreal pode mascarar comando nao executado | Critico para teste | P0 | Unreal, comandos, sincronizacao | O dashboard pode considerar `pause-session`, `resume-session` ou `add-marker` aceito antes da confirmacao real do Bridge/Blueprint. Isso ameaça controle da experiencia e leitura dos markers. | Logs recentes mostram dois ACKs para o mesmo `add-marker`: um "received by QuestSupervisor" e outro "accepted by QuestSupervisorCommandBridgeActor". O broker encerra a pendencia no primeiro ACK. O plugin auto-ACKa quando `RuntimeConfig.bAutoAckCommands` esta ligado. | No projeto do teste, configurar `Auto Ack Commands=false`. Como melhoria de codigo, diferenciar ACK tecnico de recebimento e ACK final de execucao, ou impedir ACK automatico quando existir Bridge responsavel. |
| HUB-003 | Correcoes de timestamp do Polar precisam ser portadas/confirmadas nesta versao | Critico para teste | P0 | Sensores, sessao, sincronizacao | A pasta antiga ja resolve `packet.timestamp` para `collectedAt` e janela ECG; se a versao nova usar o cliente simplificado, pode voltar a usar tempo de chegada do adapter. | Em `hub-ue-main`, `polar_h10_bridge.py` usa `timestamp_to_iso(packet.get("timestamp"))`, `firstSampleAt`, `lastSampleAt` e `sampleTimestampMode`. Nesta pasta nova, `tools/polarh10_client.py` ainda usa `utc_now_iso()` em `collectedAt` e publica ECG embutido em `hrv.raw`. | Portar a bridge antiga ou atualizar `biofeedback-polarh10` para usar `packet.timestamp`, `ecg.raw` separado e janela de amostras. Aceite: novo log mostra `collectedAt` derivado do driver e ECG rastreavel por topico. |
| HUB-004 | Export do run completo ainda precisa ser comprovado com sensor + Unreal reais | Critico para teste | P0 | Exportacao, leitura minima | Sem export validado, a equipe pode terminar o teste sem artefato analisavel fora do dashboard. | O dashboard tem exports locais, mas os logs recentes validam principalmente Unreal/lifecycle/commands. Nao ha evidencia de um run completo com HRV real exportado. | Ao final do proximo teste, gerar e conferir: report JSON, report CSV, marker snapshots CSV, biometrics CSV/JSON e JSONL bruto da sessao. |
| HUB-005 | Cliente Polar H10 nao tem reconexao automatica documentada no codigo | Critico para teste | P1 | Sensores, captura | Qualquer queda do WebSocket do driver Polar ou do hub pode encerrar a captura do sensor durante a experiencia. | `biofeedback_hub.tools.polarh10_client` usa `async with websockets.connect(...)` e `asyncio.gather(...)` sem loop de retry/backoff. | Adicionar retry com backoff para conexao com hub e driver Polar, ou pelo menos criar runbook operacional para relancar rapidamente e marcar a lacuna no log. |
| HUB-006 | ECG bruto do Polar precisa continuar separado de HRV no contrato da versao nova | Ajuste importante | P1 | Sensores, exportacao | Se ECG ficar embutido dentro de `hrv.raw`, o dashboard/report pode nao exportar o sinal bruto de forma clara para analise offline. | A bridge antiga gera `ecg.raw` com `ecg`, `sampleCount`, `sampleRateHz`, `sampleIntervalMs`, `firstSampleAt`, `lastSampleAt` e `driverTimestamp`. O cliente novo publica `ecg` dentro do payload `hrv.raw`. | Portar `ecg.raw` da bridge antiga ou criar export dedicado para ECG. |
| HUB-007 | Hub nao expira ACK pendente por timeout proprio | Ajuste importante | P1 | Hub, comandos, diagnostico | Se um cliente nao responder e continuar conectado, `/status` pode manter pendencias antigas, confundindo diagnostico do teste. | `TopicBroker` guarda `_pending_acks` e remove apenas em `acknowledge` ou `disconnect`; o dashboard tem timeout proprio de 5s, mas o hub nao. | Adicionar TTL de ACK no hub e expor estado `pending/timeout` em `/status`. |
| HUB-008 | Dashboard salva apenas subconjunto da telemetria HRV no `localStorage` | Ajuste importante | P1 | Dashboard, logs, exportacao | O report local preserva resumo, mas perde arrays brutos como `ibiMs` e `ecg`; para pesquisa, isso pode limitar analise se o JSONL bruto nao for coletado. | `experiencePersistence.ts` sanitiza `hrv.raw` e troca arrays por `ibiSampleCount`. `sensorTelemetry.ts` limita visualizacao/export de stream por linhas recentes. | Para V0, anexar JSONL bruto ao pacote de dados. Para V1, criar export completo de biometria por run sem depender do limite visual. |
| HUB-009 | Limite local de 5000 eventos pode truncar run longo ou ECG de alta frequencia | Ajuste importante | P1 | Dashboard, captura, exportacao | Em uma sessao longa ou com ECG bruto, o dashboard pode descartar amostras antigas antes do export local. | `EXPERIENCE_EVENT_LIMIT = 5000` no dashboard. O hub ainda grava JSONL, mas a UI/report pode ficar incompleta. | Mostrar alerta quando o limite estiver perto e oferecer export baseado no JSONL do hub ou paginação por arquivo de sessao. |
| HUB-010 | `hrv.raw` ainda e schema aberto demais para teste com dado real | Ajuste importante | P1 | Sensores, leitura minima | Payloads incompletos podem passar pelo hub e chegar ao report sem `bpm`, `rrMs`, `sequence`, `device` ou qualidade de sinal. | O envelope valida formato geral, mas nao valida payload por topico. `docs/sensor-quality.md` lista campos recomendados, nao obrigatorios. | Definir contrato minimo V0 para `hrv.raw`: `device`, `source`, `sequence`, `bpm` ou `rrMs`, `signalQuality/sampleAgeMs` quando possivel. Validar no adapter e no doctor. |
| HUB-011 | `biofeedback-doctor` precisa virar preflight de teste real | Ajuste importante | P1 | Diagnostico, sensores, Unreal | Sem preflight automatizado, a equipe pode descobrir falta de sensor, Unreal sem subscribe ou token errado somente depois da experiencia. | O handoff ja cita melhorar doctor para destacar sensores reais e atividade HRV. | Fazer doctor checar: hub online, dashboard opcional, cliente Unreal inscrito em `unreal.commands`, sensor com amostras recentes, lifecycle observado e pending ACKs. |
| HUB-012 | Sessao do hub (`sessionId`) e run analitico (`runId`) ainda podem divergir na operacao | Ajuste importante | P2 | Sessao, logs, exportacao | O JSONL e nomeado por `sessionId`, enquanto o dashboard/report usa `runId`. Isso dificulta encontrar os dados certos depois do teste. | Config do hub gera `session-...`; lifecycle usa `runId`. Handoff lista melhorar semantica de `sessionId`, `runId` e `sessionTimeMs`. | Registrar `runId` em todos os exports e criar indice simples `sessionId -> runIds -> arquivos/exportados`. |
| HUB-013 | Falta runbook curto de coleta V0 com evidencias obrigatorias | Critico para teste | P0 | Operacao, logs, exportacao | Mesmo com codigo funcionando, a equipe pode nao capturar as evidencias necessarias para decidir correcoes. | Docs estao completos, mas espalhados entre README, handoff, Unreal e sensores. | Criar checklist de uma pagina: setup, preflight, inicio, durante, fim, exports, nomes dos arquivos e criterios de sucesso/falha. |
| HUB-014 | Logs JSONL nao tem indice/visualizador local por sessao | Melhoria futura | P2 | Logs, leitura | A leitura manual de JSONL funciona, mas fica lenta para comparar runs, filtrar topicos e anexar evidencia. | Persistencia atual e append-only em `data/sessions`. | Criar CLI `biofeedback-session inspect/export` com resumo por topico, cliente, periodo, lifecycle e gaps de sensor. |
| HUB-015 | Suporte a multiplos sensores existe, mas ainda falta modelo de qualidade por sensor | Melhoria futura | P2 | Sensores, analytics | V1/V2 precisara comparar HRV, ECG, IMU, EEG etc. com qualidade, gaps e unidade padronizada. | Dashboard ja reconhece topicos e chaves genericas; docs recomendam campos em `sensor-quality.md`. | Criar modelo comum de sensor sample/quality e cards por sensor com `signalQuality`, `sampleAgeMs`, `sequence gaps` e taxa de amostragem. |
| HUB-016 | Export cientifico ainda nao tem formato final versionado | Melhoria futura | P2 | Exportacao, pesquisa | Para V1/V2, pesquisadores precisarao importar dados em Python/R sem adaptar manualmente cada export. | Report JSON tem `schemaVersion: 1`, mas biometria bruta e arquivos externos ainda nao formam um pacote unico. | Definir pacote de export: `manifest.json`, `events.jsonl`, `biometrics.csv/parquet`, `markers.csv`, `commands.csv`, metadados do dispositivo e versao do protocolo. |
| HUB-017 | Falta historico persistente multi-run no dashboard | Melhoria futura | P3 | Dashboard, produto | Hoje o dashboard e operacional/local; uma plataforma de analytics precisara consultar runs anteriores. | `localStorage` guarda uma sessao restauravel, nao uma base multi-run. | Evoluir para armazenamento local indexado ou backend persistente quando entrar V1/V2. |
| HUB-018 | Faltam testes automatizados cobrindo Polar H10 e fluxo completo de export | Ajuste importante | P2 | Testes, sensores, exportacao | Regressao pode passar se mudar adapter, lifecycle ou report sem simular o run inteiro. | Testes cobrem broker, runtime, dashboard e exports parciais; nao ha teste end-to-end Polar + lifecycle + report. | Adicionar teste com pacotes Polar simulados, lifecycle started/ended, markers e serializacao de report. |

## Pacote minimo de evidencia para aceitar V0

Um teste V0 deve ser considerado aceitavel quando existir uma pasta ou registro com:

- JSONL bruto da sessao do hub.
- Print ou saida de `/status` mostrando Unreal conectado e sensor conectado.
- Pelo menos um `experience.lifecycle started` e um `experience.lifecycle ended`.
- Pelo menos dois `experience.marker` vindos do XR ou de comando aceito pelo Bridge.
- Amostras `hrv.raw` durante a janela da experiencia.
- Export JSON do report.
- CSV de markers.
- CSV ou JSON de biometria.
- Nota curta com versoes: hub, plugin, projeto Unreal, dispositivo/sensor e endpoint usado.

## Ordem sugerida de correcao

1. **Antes do proximo teste**: HUB-001, HUB-002, HUB-003, HUB-004, HUB-013.
2. **Ainda no ciclo V0**: HUB-005, HUB-006, HUB-007, HUB-008, HUB-009, HUB-010, HUB-011.
3. **V1/V2/V3**: HUB-014, HUB-015, HUB-016, HUB-017, com HUB-018 entrando conforme a equipe estabilizar o adapter real.
