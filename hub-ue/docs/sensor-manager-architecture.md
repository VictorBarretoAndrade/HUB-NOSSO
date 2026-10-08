# Arquitetura Sensor Manager para integração modular de sensores no Hub

## Status da proposta

Este documento consolida a proposta de arquitetura discutida para evolução do Hub. Ele não define uma implementação imediata. A implementação deve começar somente depois da aprovação do orientador/equipe.

## Objetivo

Propor uma arquitetura modular para integrar sensores ao Hub de forma mais simples, visual e extensível, sem depender de um único driver monolítico. A intenção é permitir que usuários não técnicos consigam ver sensores disponíveis no dashboard, conectar sensores, visualizar uma prévia ao vivo e escolher quais sensores entram oficialmente em uma sessão.

## Decisão central

A proposta não é criar um driver universal mágico que entende qualquer sensor sozinho. Isso não é realista porque cada sensor pode usar Bluetooth/BLE, USB/Serial, UDP, WebSocket, SDK proprietário ou outro protocolo.

A proposta é criar uma arquitetura modular:

- O Núcleo do Hub (Hub Core) continua responsável por WebSocket, roteamento, logs e persistência.
- O Dashboard / Interface Visual (Dashboard UI) vira a interface principal para o usuário.
- O Gerenciador de Sensores (Sensor Manager) coordena sensores, adapters, preview, conexão e participação na sessão.
- Os Adapters de Sensores (Sensor Adapters) traduzem sensores/protocolos específicos para o contrato do Hub.
- O Tratador de Dados (Data Processor) fica previsto como evolução para processamento avançado.
- Relatórios e Exportação (Reports / Export) registram quais sensores participaram e quais dados foram coletados.

## Relação com Lab Streaming Layer (LSL)

O LSL deve ser tratado como camada preferencial de integração para sensores que já tenham suporte ou que possam publicar streams compatíveis.

Ele entra na arquitetura como um adapter/fonte dentro do Sensor Manager, não como substituto completo do Hub. O objetivo é evitar retrabalho: descoberta de streams, transporte de amostras, sincronização temporal e export científico bruto devem aproveitar LSL quando possível.

O que o LSL já ajuda a resolver:

- descoberta de streams disponíveis na rede local;
- leitura de amostras por inlet;
- publicação de streams por outlet;
- sincronização temporal entre fontes;
- integração com ferramentas de gravação científica, como LabRecorder/XDF;
- suporte amplo a sensores e softwares de laboratório.

O que continua sendo responsabilidade do Hub:

- interface visual simples para usuários não técnicos;
- decisão de quais sensores entram oficialmente na sessão;
- separação entre preview e dado persistido;
- comandos da Unreal e comandos operacionais;
- markers, lifecycle, ACKs e logs JSONL do experimento;
- relatórios de sessão legíveis pela equipe;
- união operacional entre Unreal, sensores, dashboard e exportações.

Decisão recomendada:

- V0.2 deve formalizar o LSL como adapter/fonte preferencial, sem implementar runtime.
- V0.3 deve criar o Sensor Manager mínimo para expor sensores e streams como recursos operacionais.
- V0.4 deve implementar o `lsl_adapter` mínimo para descobrir streams e consumir dados principais.
- O Sensor Manager deve aceitar fontes `lsl`, `direct_adapter` e `simulator`, para que sensores sem LSL continuem sendo rota oficial quando necessário.
- Adapters diretos devem declarar a qualidade temporal da amostra: timestamp do sensor, timestamp do driver/adapter ou fallback de chegada no Hub.
- O usuário só salva dados quando o sensor/stream entra oficialmente na sessão.
- Quando houver LSL disponível, evitar criar transporte paralelo desnecessário para o mesmo sensor.
- O driver Polar H10 atual pode continuar existindo no V0 se for o caminho mais rápido para a demo, mas deve ser visto como adapter específico ou ponte temporária.

Em resumo: LSL reduz bastante o trabalho de transporte e sincronização de sensores, mas não elimina a necessidade do Hub como camada de operação, visualização, sessão, Unreal e rastreabilidade.

## Arquitetura modular

Fluxo conceitual:

```text
Sensor físico
  -> Adapter de Sensor
  -> Gerenciador de Sensores
  -> Núcleo do Hub
  -> Dashboard / Relatórios / Exports
```

Fluxo com Unreal preservado:

```text
Dashboard
  -> unreal.commands
  -> sensor.commands
  -> experience.lifecycle / experience.marker

Hub
  -> roteia comandos e eventos por tópico
  -> salva apenas o que faz parte da sessão
```

## Módulos propostos

### Núcleo do Hub (Hub Core)

Responsabilidades:

- Manter o WebSocket local.
- Validar envelope das mensagens.
- Rotear mensagens por tópico.
- Manter logs JSONL.
- Expor status dos clientes.
- Encaminhar comandos e ACKs.
- Aplicar regras de persistência por tópico/sessão.

O Hub Core não deve conter lógica específica de conexão com Polar H10, EEG, IMU ou qualquer sensor físico.

### Dashboard / Interface Visual (Dashboard UI)

Responsabilidades:

- Mostrar sensores configurados, disponíveis, conectados e em erro.
- Permitir buscar sensores.
- Permitir conectar e desconectar sensores.
- Mostrar preview ao vivo.
- Mostrar qualidade do sinal.
- Permitir usar/remover sensores da sessão.
- Mostrar preflight antes de iniciar a sessão.
- Mostrar gráficos, relatórios e exportações.

O dashboard deve ser a interface principal para usuários não técnicos.

### Gerenciador de Sensores (Sensor Manager)

Responsabilidades:

- Ler configuração local de sensores.
- Coordenar adapters.
- Executar descoberta quando o adapter suportar scan.
- Controlar estados do sensor.
- Publicar `sensor.status`.
- Publicar `sensor.preview`.
- Receber comandos do dashboard via Hub.
- Iniciar/parar gravação de dados persistentes quando o sensor entra/sai da sessão.

### Adapters de Sensores (Sensor Adapters)

Responsabilidades:

- Conectar ao sensor/protocolo real.
- Ler dados brutos.
- Corrigir timestamps quando possível.
- Normalizar unidades e campos mínimos.
- Estimar qualidade do sinal.
- Publicar preview, status e dados persistentes quando autorizado.

Exemplos:

- `polarh10`
- `generic_websocket`
- `simulator`
- futuro `generic_serial`
- futuro `ble_generic`
- futuro adapter de EEG/IMU.

### Tratador de Dados (Data Processor)

Módulo futuro, pós-MVP.

Responsabilidades previstas:

- Filtrar sinais.
- Calcular métricas derivadas.
- Reprocessar dados brutos.
- Gerar features científicas.
- Padronizar sinais para análise.

Exemplos:

- `ecg.raw` -> filtros -> batimentos detectados -> métricas HRV avançadas.
- `imu.raw` -> suavização -> movimento/agitação.
- `eeg.raw` -> bandas alfa/beta/theta.

### Relatórios e Exportação (Reports / Export)

Responsabilidades:

- Registrar sensores usados na sessão.
- Registrar horário de entrada e saída de cada sensor.
- Registrar tópicos gravados.
- Registrar contagem de amostras.
- Registrar qualidade, gaps e avisos.
- Exportar JSONL, CSV e relatório da sessão.

## Estados dos sensores

Estados sugeridos:

- `configured`: existe na configuração, mas ainda não foi encontrado.
- `available`: foi encontrado e pode conectar.
- `connecting`: está tentando conectar.
- `connected`: conectado e com preview/status disponível.
- `recording`: incluído oficialmente na sessão e publicando dados persistentes.
- `stale`: conectado, mas sem amostra recente.
- `error`: falha no adapter, sensor ou conexão.
- `disconnected`: desconectado.
- `unavailable`: configurado, mas não encontrado.

Separações importantes:

- Conectado não significa gravando.
- Preview não significa dado oficial da sessão.
- Recording significa incluído oficialmente na sessão.
- Stale significa que a fonte parou de entregar amostras recentes; não significa
  que o run foi encerrado ou que dados ausentes foram preenchidos.

O Sensor Manager mede freshness com relógio monotônico. Depois do limite padrão
de cinco segundos, publica uma única transição para `stale` e troca a qualidade
para `stale`. Se o sensor estava recording, conserva o `runId` e o gate aberto
para permitir recuperação sem criar um segundo vínculo. A primeira amostra nova
publica `recovered` e restaura `recording`; detach e disconnect continuam tendo
precedência e fecham o gate imediatamente.

Quando o adapter informa uma taxa nominal positiva, o limite sobe para pelo
menos três períodos dessa taxa. Um sensor armado permanece elegível para attach
mesmo se ficar stale antes do lifecycle; ele entra no run com gate aberto e sem
amostras artificiais. O encerramento inesperado do iterador de amostras vira
erro explícito e desconecta o adapter, evitando um card conectado sem consumidor.
Para streams irregulares (`nominalSrateHz: 0`), silêncio não implica stale e o
limite é publicado como `null`. Repetir attach para o mesmo run com gate aberto
é idempotente, inclusive quando o sensor está stale.

## AutoConnect

O Hub/Sensor Manager não deve conectar automaticamente em todos os sensores por padrão.

Regra aprovada:

- Sensores são listados ao iniciar o sistema.
- O usuário escolhe o que conectar.
- `autoConnect` pode existir por configuração.
- `autoConnect` deve ser `false` por padrão.

Exemplo:

```json
{
  "id": "polar-h10-main",
  "adapter": "polarh10",
  "displayName": "Polar H10 Principal",
  "deviceType": "hrv",
  "topics": ["hrv.raw", "ecg.raw"],
  "autoConnect": false,
  "defaultIncludeInSession": false
}
```

## Descoberta e configuração

No MVP/V0, a descoberta será híbrida simples:

- Arquivo de configuração define sensores/adapters conhecidos.
- Cada adapter pode implementar `scan/discover` se suportar.
- O dashboard mostra sensores configurados, encontrados, conectados e indisponíveis.

Regra importante:

- O V0 não promete descoberta universal automática.
- Sensores desconhecidos precisam de configuração manual ou adapter específico.
- Cadastro manual pelo dashboard fica para V1/V2.

## Preview e gravação oficial

O sensor pode estar conectado e mostrar preview sem gravar dados oficiais.

Fluxo:

```text
Conectar sensor
  -> dashboard mostra preview
  -> preview não salva

Usar na sessão
  -> antes do run, sensor pode ficar armedForNextRun
  -> experience.lifecycle started fornece o runId
  -> dashboard confirma o eco do lifecycle antes de mostrar Running
  -> sensor começa recording automaticamente
  -> dados *.raw passam a ser salvos

Fim da sessão
  -> experience.lifecycle ended faz detach automático
  -> dashboard confirma o eco do lifecycle antes de mostrar Ended
  -> sensor volta a connected e continua em preview
```

Regra:

- `sensor.preview` passa pelo Hub.
- O runtime do Hub rejeita lifecycles com `runId` concorrente antes do log e do broadcast; retries do mesmo lifecycle são idempotentes.
- O dashboard mantém uma transição sem eco como incerta e sempre repete o mesmo `runId`; conflito com o run ativo não libera nova tentativa.
- `sensor.preview` não é persistido no JSONL da sessão.
- `sensor.preview` não entra no report/export científico.
- O dashboard não assina tópicos brutos de alta frequência, como `lsl.raw`, no
  monitoramento padrão; preview e status atendem à operação, enquanto o JSONL
  preserva os lotes oficiais.
- `armedForNextRun` não grava dados oficiais e é consumido no primeiro lifecycle `started` válido.
- Dados oficiais só são salvos quando o sensor está incluído na sessão.
- `sensor.session.attach` exige que o `runId` coincida com o lifecycle ativo; antes disso, o fluxo correto é `sensor.session.arm`.
- Se o lifecycle mudar enquanto o adapter executa `start_recording`, o Sensor Manager faz rollback, mantém o gate fechado e não registra `attached`.
- Depois de `start_recording`, o Sensor Manager revalida a geração da conexão, o estado do adapter e a tarefa consumidora. Falha ou disconnect concorrente cancela o attach, executa rollback e mantém o gate fechado.
- `experience.lifecycle ended` fecha a entrada de amostras do `runId` antes do detach; amostras atrasadas são descartadas.
- A geração do gate é capturada antes da espera por cada amostra. Uma leitura iniciada antes do attach não pode ser promovida ao novo run, e uma leitura concluída após o detach permanece apenas no preview.
- Adapters com buffer próprio devem descartar o backlog anterior em `start_recording`; o adapter LSL faz essa limpeza de forma serializada com `pull_chunk`.
- No adapter LSL, `disconnect` e `stop_recording` usam a mesma exclusão da leitura e do flush, impedindo fechamento do inlet durante uma chamada nativa ativa.

## Recuperação de lifecycle

O Runtime do Hub é a autoridade sobre o run ativo e expõe `experienceLifecycle.activeRunId` em `/status`. O campo `sensorManager.activeRunId` continua disponível para compatibilidade e diagnóstico, mas não decide se uma nova experiência pode começar.

Quando o dashboard tenta iniciar um run diferente enquanto outro permanece ativo:

1. O Hub rejeita a publicação com `lifecycle_conflict`, correlacionado ao `id` enviado pelo dashboard.
2. O evento rejeitado não entra no JSONL e não chega ao Sensor Manager.
3. O dashboard mostra o `runId` autoritativo e bloqueia nova sessão.
4. O operador confirma **End pending run** somente depois de verificar que a experiência não está mais ativa na Unreal.
5. O dashboard publica `experience.lifecycle ended` com `source: "dashboard"` e `reason: "operator-recovery"`.
6. O Sensor Manager recebe o evento aceito, faz detach dos sensores desse run e bloqueia amostras atrasadas.
7. Se o eco do `ended` se perder, o dashboard só considera a recuperação concluída quando `/status` indicar lifecycle livre e nenhum sensor anexado.
8. O histórico e o relatório local anterior são preservados. Uma nova experiência exige outro clique.

O modal valida novamente o `activeRunId` no momento da confirmação. Se o run mudar, a recuperação é cancelada para evitar encerrar uma experiência diferente daquela revisada pelo operador. O plugin Unreal também correlaciona erros `lifecycle_conflict` e `lifecycle_already_ended` para transições `started` e `ended`; um início rejeitado não permanece como run pendente no dispositivo, e um encerramento rejeitado não apaga a experiência ativa aceita.

## Persistência e logs

Salvar:

- `experience.lifecycle`
- `experience.marker`
- `unreal.state`
- comandos/ACKs relevantes
- `sensor.session`
- `sensor.status` importante
- `*.raw` apenas quando o sensor está attached ao `runId`

Não salvar:

- `sensor.preview`
- scans temporários
- mensagens repetidas sem mudança operacional
- dados de sensores não incluídos oficialmente na sessão

Salvar parcialmente:

- `sensor.status` deve persistir eventos importantes, como conectado, desconectado, erro, stale, reconectando, recording_started e recording_stopped.

## Tópicos e comandos

Tópicos principais:

- `sensor.commands`: comandos do dashboard para o Sensor Manager.
- `sensor.status`: estado operacional do sensor/adapter.
- `sensor.preview`: prévia ao vivo não persistente.
- `sensor.session`: eventos de entrada/saída do sensor na sessão.
- `hrv.raw`, `ecg.raw`, `eeg.raw`, `imu.*`, `temperature.raw`: dados persistentes quando o sensor está na sessão.

Comandos MVP/V0:

- `sensor.scan`
- `sensor.connect`
- `sensor.disconnect`
- `sensor.session.attach`
- `sensor.session.detach`

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
      "sensorId": "polar-h10-main",
      "runId": "run-1",
      "reason": "dashboard"
    }
  }
}
```

O Hub aceita esse comando somente durante um lifecycle ativo com o mesmo `runId`. Para preparar o sensor antes da experiência, o dashboard usa `sensor.session.arm`, sem iniciar gravação oficial.

Exemplo de evento:

```json
{
  "event": "attached",
  "sensorId": "polar-h10-main",
  "runId": "run-1",
  "topics": ["hrv.raw", "ecg.raw"]
}
```

## Relação com Unreal

A arquitetura proposta não remove nem limita os comandos da Unreal.

Fluxos continuam separados por domínio:

- `unreal.commands` para Unreal.
- `sensor.commands` para Sensor Manager.
- `experience.lifecycle` para ciclo da experiência.
- `experience.marker` para markers.

O dashboard pode continuar enviando comandos para Unreal e também controlar sensores, usando o Hub como centro de comunicação.

## Sessão, runId e report

Todo sensor incluído na sessão deve estar ligado ao `runId`.

Eventos `sensor.session attached/detached` devem entrar no report. O `detached` automático recebido logo após `ended` permanece associado ao `runId` e aparece no limite final da timeline.

O report deve ter seção "Sensores da sessão" com:

- sensores usados;
- horário de entrada;
- horário de saída;
- tópicos gravados;
- contagem de amostras;
- qualidade;
- gaps;
- avisos.

O usuário pode incluir/remover sensor no meio da sessão. O report deve registrar isso.

## Qualidade e preflight

Todo sensor deve informar estado e qualidade.

Qualidades esperadas:

- `good`
- `poor`
- `stale`
- `unknown`
- `error`

Campos úteis:

- `lastSampleAt`
- `sampleAgeMs`
- `sampleRateHz`
- `sequence`
- `gapCount`
- `batteryPct`
- `message`

Antes de iniciar a sessão, o dashboard deve avisar problemas, mas não bloquear rigidamente o início. Exemplo:

```text
Polar H10 está stale: sem amostra há 8s.
Deseja iniciar a sessão mesmo assim?
```

## Segurança e privacidade

Regras aprovadas:

- Local-first por padrão.
- Nenhum dado sobe para nuvem automaticamente.
- Preview não é persistente.
- Dados só salvam quando o sensor está incluído na sessão.
- Logs/export mostram quais sensores participaram.
- Configuração não deve armazenar segredo sensível em texto quando possível.
- Token do Hub continua suportado.
- Perfis de experimento não devem guardar dados pessoais sensíveis no V0.
- Antes de iniciar, o dashboard mostra quais sensores serão gravados.

## Plano V0 em blocos menores

Este plano quebra o V0 em entregas rastreáveis. A ordem abaixo prioriza a demonstração de uma semana e depois avança para a arquitetura de sensores com LSL.

### V0.1 - Visualização de dados da sessão para demo

Objetivo: melhorar a parte visual do Hub/dashboard para a demonstração.

Entram:

- gráfico de FPS da Unreal por tempo de experimento;
- gráfico de temperatura do óculos por tempo de experimento;
- gráfico de latência de comunicação;
- gráfico de perda de pacote;
- linha de estado da Unreal;
- resumo visual com FPS, temperatura máxima, latência média, perda máxima e estado mais recente.

Critério de aceite:

- uma pessoa da equipe consegue abrir o relatório da sessão e enxergar qualidade técnica da execução;
- os gráficos usam dados de `unreal.state` quando enviados no payload;
- a visualização ajuda a explicar pausas, quedas de FPS, aquecimento ou instabilidade.

### V0.2 - Alinhamento LSL sem reescrever o Hub

Objetivo: documentar e preparar o ponto de entrada do LSL na arquitetura.

Entram:

- definir o futuro `lsl_adapter` como adapter oficial do Sensor Manager;
- mapear quais responsabilidades ficam com LSL e quais ficam com Hub;
- evitar duplicar descoberta, transporte e sincronização quando LSL já resolver;
- manter o Hub como camada visual, operacional e de sessão.

Não entram:

- implementação do `lsl_adapter`;
- adição de dependência `pylsl`;
- mudança de protocolo, tópicos ou dashboard.

Critério de aceite:

- a equipe entende que LSL não substitui dashboard, sessão, Unreal, markers e relatório;
- a equipe entende que LSL deve ser usado para sensores sempre que fizer sentido;
- a equipe entende que a implementação LSL mínima começa na V0.4.

### V0.3 - Sensor Manager mínimo

Objetivo: criar a base operacional de sensores sem prometer descoberta universal.

Entram:

- configuração local de sensores/adapters;
- estados `configured`, `available`, `connected`, `recording`, `stale`, `error` e `disconnected`;
- comandos `sensor.scan`, `sensor.connect`, `sensor.disconnect`, `sensor.session.arm`, `sensor.session.disarm`, `sensor.session.attach` e `sensor.session.detach`;
- separação entre preview e recording;
- adapter simulado para validar o fluxo;
- armamento antes da sessão e attach automático no lifecycle `started`;
- detach automático no lifecycle `ended`;
- estado autoritativo do lifecycle no Runtime;
- recuperação confirmada de runs órfãos;
- telemetria Unreal V2 com FPS, temperatura da bateria, RTT WebSocket e perda de probes.

Critério de aceite:

- o dashboard consegue listar sensores/streams conhecidos;
- o usuário entende quais sensores estão apenas conectados e quais estão gravando;
- preview nunca é persistido como dado oficial;
- um run órfão pode ser encerrado sem apagar logs e sem iniciar outro automaticamente;
- runs concorrentes e tentativas de reiniciar run encerrado são rejeitados com erro correlacionado;
- a equipe consegue distinguir medição Unreal disponível, indisponível e legada.

### V0.4 - Adapter LSL mínimo

Objetivo: consumir streams LSL como sensores disponíveis no Hub.

Entram:

- provider LSL opcional e visível mesmo quando a dependência está ausente;
- descoberta dinâmica de todos os streams LSL numéricos;
- um adapter gerenciado e um card por stream suportado;
- identidade estável por `source_id`, nome e tipo, com `uid` como fallback;
- consumo assíncrono em lotes para não reduzir streams rápidos a uma amostra por intervalo;
- leitura de nome, tipo, canais, taxa, formato, labels e unidades quando disponíveis;
- publicação de preview compacto sem persistência;
- lotes oficiais no tópico genérico `lsl.raw` somente durante attach;
- preservação do timestamp original, correção temporal e fallback de chegada;
- outlet numérico local para teste reproduzível.

Não entram:

- streams de texto ou markers;
- mapeamento automático para tópicos ECG, EEG ou HRV;
- gráficos específicos por canal;
- dejitter, XDF, LabRecorder ou pipeline científico de alta frequência.

Critério de aceite:

- todos os streams numéricos de teste aparecem como sensores independentes;
- o Hub inicia normalmente sem o extra LSL e informa o motivo no diagnóstico;
- os cards mostram metadados, sincronização e preview;
- preview não entra nos logs oficiais;
- `lsl.raw` só aparece após attach e para depois de detach;
- timestamps original e corrigido permanecem rastreáveis.

### V0.5 - Polar H10 e sensores já validados

Objetivo: manter os testes reais já validados funcionando dentro da nova organização.

Entram:

- manter integração com Polar H10 pelo caminho atual ou por adapter específico;
- preservar separação entre HRV e ECG bruto;
- registrar qualidade, gaps e status do sensor;
- garantir que timestamps corrigidos pelo orientador não sejam reintroduzidos como problema.

Critério de aceite:

- uma sessão real com sensor já validado continua coletando;
- o relatório identifica sensor, tópicos, contagem de amostras e avisos básicos.

### V0.6 - Report e export mínimos

Objetivo: tornar a sessão rastreável para análise e anexos.

Entram:

- seção "Sensores da sessão" no report;
- seção de telemetria Unreal no report;
- indicação de arquivos/logs relacionados ao `runId`;
- export JSON/JSONL com dados suficientes para conferência.

Critério de aceite:

- a equipe consegue decidir se a sessão é analisável;
- a equipe consegue encontrar dados de sensor, Unreal, markers e lifecycle.

### V0.7 - Preflight visual

Objetivo: reduzir erro operacional antes do teste.

Entram:

- aviso de Hub conectado;
- aviso de Unreal conectada;
- aviso de sensor sem preview recente;
- aviso de sensor conectado mas fora da sessão;
- aviso de stream LSL disponível mas não selecionado.

Critério de aceite:

- antes de iniciar a experiência, o usuário vê o que será gravado e o que não será.

### V0.8 - Documentação operacional curta

Objetivo: permitir que outra pessoa rode a demonstração.

Entram:

- passo a passo para iniciar Hub, dashboard, Unreal e sensores;
- explicação curta de LSL dentro da arquitetura;
- como validar gráficos da Unreal;
- como anexar relatório/logs da sessão.

Critério de aceite:

- uma pessoa da equipe consegue reproduzir a demo seguindo o documento.

## Extensibilidade open source

O projeto deve documentar como criar um adapter.

Interface conceitual mínima:

- `scan()`
- `connect()`
- `disconnect()`
- `preview()`
- `start_recording(runId)`
- `stop_recording(runId)`
- `status()`

Metadados de adapter:

```json
{
  "adapterId": "polarh10",
  "displayName": "Polar H10",
  "supportedDeviceTypes": ["hrv", "ecg"],
  "transports": ["ble"],
  "topics": ["hrv.raw", "ecg.raw"],
  "supportsScan": true,
  "supportsPreview": true
}
```

Testes esperados:

- Adapter não publica `*.raw` antes de attach.
- Adapter publica preview sem persistir.
- Adapter publica status.
- Adapter publica dados persistentes após attach.
- Adapter para de publicar persistente após detach.

## Escopo MVP/V0

Entram no MVP/V0:

- Visualização inicial de telemetria Unreal no dashboard/report: FPS, temperatura do óculos, latência, perda de pacote e estado.
- Planejamento explícito de LSL como adapter/fonte preferencial para sensores compatíveis.
- Arquitetura modular com Hub Core, Dashboard UI, Sensor Manager, Sensor Adapters e Reports/Export.
- Sensor Manager responsável por listar sensores configurados, coordenar adapters e controlar estados.
- Adapter LSL mínimo para descobrir/consumir streams quando disponível.
- Adapters internos principais: Polar H10 e simulador ou `generic_websocket`.
- Configuração inicial por arquivo.
- Aba Sensores no dashboard.
- Conectar/desconectar sensores pelo dashboard.
- Preview ao vivo.
- Qualidade do sinal.
- Usar/remover sensor da sessão.
- `autoConnect` opcional, desligado por padrão.
- Separação entre conectado, preview e recording.
- `sensor.preview` não persistente.
- `*.raw` persistido apenas quando sensor está attached ao `runId`.
- Eventos `sensor.session attached/detached`.
- Report com seção "Sensores da sessão".
- Preflight visual com avisos.
- Segurança local-first.

## Pós-MVP / V1

Entram como evolução V1:

- Cadastro manual de sensores pelo dashboard.
- Wizard "Adicionar sensor".
- Adapters genéricos mais completos: WebSocket, Serial/USB, BLE, UDP.
- Integração mais completa com LabRecorder/XDF quando o fluxo LSL estiver validado.
- Perfis locais de experimento / presets de sessão.
- Melhor auto-descoberta.
- Dashboard iniciar/parar adapters de forma mais automática.
- Tela de calibração por sensor.
- Tratador de Dados inicial.
- Alertas configuráveis de qualidade, stale, bateria baixa, perda de amostras e sample rate abaixo do esperado.

## V2/V3

Entram como visão futura:

- Plugins externos de adapters.
- Catálogo de adapters da comunidade.
- Instalação de adapters externos.
- Perfis por usuário, projeto ou laboratório.
- Pipeline científico versionado.
- Reprocessamento avançado de dados brutos.
- Tratamento avançado por tipo de sinal.
- Sincronização com plataforma/servidor.
- Multi-participante e multi-sessão avançado.
- Permissões, papéis e auditoria.
- Templates de experimento compartilháveis.
- Export científico completo com pacote versionado.

## Fora do MVP/V0

Ficam fora de propósito:

- Driver universal que entende qualquer sensor sozinho.
- Descoberta automática de qualquer hardware sem configuração.
- Cadastro manual completo pelo dashboard.
- Plugins externos instaláveis.
- Tratamento científico pesado dentro do Hub Core.
- Conexão direta do dashboard com todo tipo de hardware.
- Nuvem/sincronização remota.
- Perfis por usuário/projeto com permissões.

## Perfis locais de experimento

Ideia aprovada para V1:

Permitir salvar presets locais com sensores, adapters, preferências de sessão, gráficos, preflight e exportações. O objetivo é reduzir configuração repetitiva e evitar erro operacional em testes recorrentes.

Exemplo:

```json
{
  "experimentProfileId": "presence-training-hrv",
  "displayName": "Presence Training - HRV",
  "requiredSensors": ["polar-h10-main"],
  "optionalSensors": ["imu-usb"],
  "defaultCharts": ["hrv", "ecg", "unreal.telemetry"],
  "exports": ["jsonl", "csv", "report"],
  "preflightChecks": ["unreal.connected", "polar.preview.good"]
}
```

Perfis por usuário, projeto ou laboratório ficam para V2/V3.

## Riscos e decisões em aberto

Riscos:

- Nem todo sensor pode ser descoberto automaticamente.
- Alguns sensores exigem SDK proprietário ou permissão especial.
- Bluetooth/BLE pode limitar múltiplas conexões.
- Preview precisa ser claramente separado da gravação.
- Regras de persistência precisam ser implementadas com cuidado.
- Tratamento avançado de dados não deve entrar cedo demais no Hub Core.
- Dashboard não deve prometer conexão direta com qualquer hardware.

Decisões em aberto:

- Qual adapter genérico entra primeiro no V0: `generic_websocket`, `generic_serial` ou apenas simulador.
- Quais sensores reais entram depois da Polar H10.
- Se o dashboard iniciará adapters no V0 ou apenas controlará sensores já disponíveis.
- Se o report V0 terá apenas resumo dos sensores ou export detalhado por tópico.
- Se perfis de experimento entram em V1 ou V2.

Recomendação atual:

- V0: Polar H10 + simulador + `generic_websocket`.
- V1: cadastro manual e perfis locais de experimento.
- V2/V3: plugins externos, catálogo e pipeline científico.

## Critério de aceite

A proposta pode ser considerada aceita quando a equipe conseguir decidir:

- se a arquitetura modular deve ser implementada;
- quais módulos entram no MVP/V0;
- quais funcionalidades ficam para V1/V2;
- quais adapters entram primeiro;
- qual regra de persistência será adotada;
- como o dashboard deve apresentar sensores para usuários não técnicos.

Critérios específicos:

- Entender que não é um driver universal monolítico.
- Aprovar a arquitetura modular.
- Aprovar o fluxo visual pelo dashboard.
- Aprovar preview não persistente.
- Aprovar salvamento apenas quando sensor entra oficialmente na sessão.
- Aprovar tópicos e comandos principais.
- Aprovar escopo MVP/V0 e pós-MVP.
- Escolher quais adapters entram primeiro.
