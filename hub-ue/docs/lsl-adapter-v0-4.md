# Adapter LSL mínimo - V0.4

Este documento descreve a integração mínima do Lab Streaming Layer (LSL) com o
Sensor Manager. A V0.4 permite descobrir streams numéricos, visualizar uma
prévia e registrar lotes oficiais somente durante uma sessão anexada.

## Limites da versão

Entram na V0.4:

- descoberta de todos os streams LSL numéricos visíveis na rede local;
- um card de sensor por stream suportado;
- metadados básicos, labels e unidades de canais quando fornecidos;
- preview compacto e não persistente;
- lotes `lsl.raw` persistidos somente após attach;
- timestamps LSL original e corrigido;
- diagnóstico de instalação e estado do provider LSL.

Ficam para versões posteriores:

- streams de texto e markers;
- interpretação automática como ECG, EEG, HRV ou outro domínio;
- gráficos específicos por canal;
- LabRecorder, XDF e gravação científica de alta frequência;
- isolamento da biblioteca nativa LSL em um processo separado;
- configuração visual avançada e mapeamento manual de canais.

O JSONL da V0.4 comprova o fluxo operacional, mas não substitui XDF para uma
coleta científica extensa ou de alta frequência.

O dashboard usa `sensor.preview`, `sensor.status` e `sensor.session` para a
operação ao vivo. Ele não assina `lsl.raw` por padrão: os lotes completos
continuam no JSONL autoritativo, sem atravessar e ser acumulados novamente na
interface. O cliente interno `sensor-manager` também não é tratado como sensor
físico pela lista e pelo export legado; cada dispositivo continua representado
pelo próprio card gerenciado.

O logger usa uma fila limitada e mantém o erro de disco como terminal. A fila
acorda produtores que aguardavam espaço quando a escrita falha; eventos de
lifecycle e ACKs de controle só são distribuídos depois da confirmação de
persistência. A telemetria de alta frequência usa admissão assíncrona para não
introduzir o tempo do disco no caminho de captura, e o flush final expõe qualquer
falha de persistência no diagnóstico.

## Instalação

O suporte LSL é opcional. O Hub continua iniciando sem ele.

```powershell
.\.venv\Scripts\python -m pip install -e "apps\hub[lsl]"
```

Se `pylsl` ou a biblioteca nativa não puderem ser carregados, o dashboard e o
`biofeedback-doctor` mostram o provider como indisponível. Em instalações que
exigem uma DLL externa, configure `PYLSL_LIB` com o caminho completo da
biblioteca antes de iniciar o Hub.

## Fluxo operacional

```text
LSL outlet
  -> LslDiscoveryProvider
  -> um LslManagedSensorAdapter por stream
  -> Sensor Manager
  -> sensor.preview (não persistente)
  -> lsl.raw (somente durante attach)
  -> JSONL da sessão
```

Ao clicar em **Scan**, cada stream numérico encontrado aparece como um sensor
independente. O operador ainda precisa conectar o stream e usar **Arm** antes da
experiência ou **Attach** durante um run ativo.

Ao iniciar o attach, o adapter serializa a leitura nativa e descarta as amostras
que ainda estavam no buffer do inlet. O Sensor Manager também registra o estado
do gate antes de aguardar cada novo lote. Assim, uma leitura iniciada antes do
attach continua disponível apenas como preview e nunca se torna dado oficial do
novo run. A mesma geração fecha imediatamente no detach e bloqueia lotes tardios.
`pull_chunk`, limpeza do buffer, parada da gravação e fechamento do inlet usam a
mesma exclusão por stream. Se um disconnect ocorrer durante o `flush`, ele espera
a chamada terminar; o adapter revalida a conexão antes de aceitar o `runId`.

O `pylsl` roda dentro do processo do Hub nesta versão. Chamadas nativas já
iniciadas são aguardadas no cancelamento para impedir que o inlet seja fechado
enquanto a DLL ainda o utiliza. Os timeouts da própria LSL limitam descoberta,
abertura, leitura e correção temporal. Uma DLL que ignore esses limites e trave
pode exigir o reinício do Hub; isolamento em subprocesso fica para uma versão
posterior.

## Outlet de teste

O projeto inclui um gerador local de dois canais a 10 Hz:

```powershell
.\.venv\Scripts\biofeedback-lsl-sim
```

Em outro terminal, inicie o Hub e o dashboard:

```powershell
.\.venv\Scripts\biofeedback-hub
npm run dev:dashboard
```

No dashboard:

1. Abra `Controle da sessão > Sensores`.
2. Clique em **Scan**.
3. Conecte `Biofeedback Hub Test`.
4. Confirme que o preview muda e que o provider está `ready`.
5. Arme o stream e inicie uma experiência, ou faça attach durante um run.
6. Encerre a experiência e confirme o detach.

## Evidência esperada

- captura do card com nome, tipo, canais, taxa, sincronização e preview;
- ausência de `sensor.preview` no JSONL;
- ausência de `lsl.raw` antes do attach;
- ausência, dentro de `lsl.raw`, de amostras coletadas antes da fronteira do attach;
- presença de `lsl.raw` com `runId` durante a sessão;
- interrupção de novos lotes oficiais após detach;
- link do PR da V0.4 para `HUB-Refinement`.

## Timestamps

Cada amostra preserva:

- `lslTimestamp`: timestamp original fornecido pelo outlet;
- `correctedLslTimestamp`: timestamp no domínio local do inlet;
- `collectedAt`: estimativa UTC calculada pelo deslocamento entre o relógio LSL
  local e o relógio UTC do Hub na chegada do lote;

O bloco `sync` do lote preserva `timeCorrectionSec` e o estado da correção. O
envelope da mensagem preserva `hubReceivedAt`, horário em que o Hub processou
o lote.

A primeira estimativa usa timeout de dois segundos por padrão. Esse limite pode
ser ajustado com `BIOFEEDBACK_LSL_TIME_CORRECTION_TIMEOUT_SECONDS` quando a rede
do laboratório precisar de mais tempo. Uma expiração mantém o stream em
`warming-up` e ativa o fallback declarado; ela não inventa uma correção.

Após a leitura inicial, as atualizações de `time_correction()` são disparadas em
background. Uma chamada nativa lenta não bloqueia `pull_chunk`, preview nem a
gravação do lote: a última correção válida continua sendo usada até que a nova
seja concluída. Falhas transitórias marcam a correção como `stale` e preservam a
idade e o motivo no diagnóstico. Uma nova conexão reinicia o aquecimento.

O relógio LSL não é tratado como época Unix. Quando a correção ainda não está
pronta, o lote declara sincronização em aquecimento. O Hub ancora a amostra
mais recente no horário UTC de chegada e preserva em `collectedAt` os intervalos
relativos indicados pelos timestamps LSL; `correctedLslTimestamp` permanece
nulo. Se uma atualização transitória falhar depois de existir uma correção
válida, o estado passa para `stale` e informa `timeCorrectionAgeSec`, sem apagar
a última correção conhecida. Uma reconexão descarta essa correção e volta ao
aquecimento. A V0.4 não aplica dejitter nem altera a sequência temporal
recebida.

Cada item de `samples` informa `collectedAtSource`. Em lotes com timestamps
mistos, o bloco `sync` usa `collectedAtSource: "mixed"` e mantém a origem real
de cada amostra, em vez de classificar todo o lote como horário de chegada.
Se também houver uma correção temporal stale, `correctionStatus` e
`correctionReason` preservam esse segundo diagnóstico. Cancelamentos durante
criação, abertura, leitura de metadados ou correção aguardam a chamada nativa
terminar antes de fechar o inlet.

## Interrupção e recuperação do stream

O Sensor Manager acompanha a idade da última amostra. Após cinco segundos sem
dados, por padrão, o card muda para `stale` e a qualidade também deixa de ser
mostrada como boa. Se o sensor estava attached, o vínculo com o run e o gate de
gravação são preservados, mas nenhum dado é fabricado durante a lacuna. Quando
as amostras voltam, o Sensor Manager publica `recovered` e continua no mesmo
run. Detach ou disconnect fecham o gate mesmo durante o estado stale.

Em streams regulares lentos, o timeout cresce para pelo menos três períodos da
taxa nominal. Sensores armados podem atravessar uma lacuna stale e entrar no run
sem perder o vínculo; o estado só volta a recording quando chegar uma amostra.
Streams irregulares (`nominalSrateHz: 0`) não usam silêncio como prova de falha:
o Hub publica `staleAfterMs: null` e não força um estado stale localmente.
Se o consumidor falhar, uma nova conexão aguarda a desconexão e a limpeza da
tarefa anterior terminarem antes de abrir outro consumidor. Isso impede o estado
`connected` sem uma tarefa ativa de leitura.

Quando um stream reaparece enquanto continua anexado, uma nova varredura não
força o estado `connected`: o card permanece `stale` até que uma amostra prove a
recuperação. Isso evita que uma descoberta de metadados seja confundida com a
retomada efetiva do fluxo.

## Problemas comuns

- **Provider unavailable:** instale o extra `lsl` e reinicie o Hub.
- **Native library error:** confira `PYLSL_LIB` e a arquitetura 64 bits.
- **Nenhum stream encontrado:** confirme que o outlet está ativo e que a rede
  ou o firewall permite descoberta LSL.
- **Stream aparece, mas não mostra preview:** conecte o card e confirme que o
  outlet está publicando amostras.
- **Stream fica stale:** confira se o outlet continua publicando; o Hub mantém
  o vínculo da sessão e retoma o mesmo run quando os dados voltarem.
- **Stream ignorado:** a V0.4 aceita apenas formatos numéricos; texto e markers
  permanecem fora do escopo.
