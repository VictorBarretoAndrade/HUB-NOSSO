# Como o LSL funciona no Biofeedback Hub

## Objetivo deste documento

Este documento explica, em linguagem direta, o que é o Lab Streaming Layer (LSL), como ele se conecta ao Biofeedback Hub e como os dados são recebidos, visualizados e gravados na V0.4.

Também registra uma decisão importante para experimentos com vários sensores: o tópico `lsl.raw` continua sendo a fonte bruta canônica, mas cada stream permanece identificado e pode ser separado por sensor em consultas, exports e futuras camadas semânticas.

## Resumo em uma frase

O LSL é uma camada especializada para descobrir e transportar streams de séries temporais de pesquisa com metadados e referências temporais; o Hub usa essa camada para receber os dados, mas continua responsável por sessão, usuário, Unreal, preview, attach, logs e relatórios.

> **Decisão da V0.4:** cada stream LSL tem seu próprio adapter, sensor, estado e `sensorId`. O tópico `lsl.raw` é compartilhado apenas como categoria de dado bruto; os sinais não são misturados em uma única amostra.

## 1. O que é o Lab Streaming Layer

O Lab Streaming Layer, normalmente chamado de LSL, é um middleware criado para a coleta unificada de séries temporais em experimentos. Ele foi pensado para sinais como ECG, EEG, frequência cardíaca, movimento, áudio, eventos e outras medições que precisam ser analisadas ao longo do tempo.

O LSL fornece uma biblioteca principal, a `liblsl`, e interfaces para diferentes linguagens. Aplicações de aquisição e drivers podem publicar dados em um **Outlet**. Outro programa pode localizar esse stream e recebê-lo por meio de um **Inlet**.

O LSL organiza quatro coisas importantes:

- descoberta de streams disponíveis na rede local;
- transporte de amostras individuais ou em lotes;
- metadados do stream, como nome, tipo, canais e taxa nominal;
- timestamps e informações para relacionar o relógio do produtor ao relógio do consumidor.

### O que o LSL não é

O LSL não é um driver Bluetooth universal, não substitui USB ou serial e não conversa diretamente com todos os sensores físicos. O driver ou aplicativo do fabricante continua sendo responsável por estabelecer a conexão com o equipamento.

O caminho normalmente é:

```text
Sensor físico
  -> driver ou aplicativo do fabricante
  -> LSL Outlet
  -> rede local
  -> LSL Inlet do Hub
```

Por exemplo, uma cinta Polar H10 pode continuar precisando de um driver Bluetooth específico. Se esse driver ou uma ponte publicar os dados como LSL, o Hub poderá recebê-los pelo adapter LSL. Se não publicar, a cinta continua usando um adapter direto, como a integração Polar já validada.

## 2. Que tipo de conexão o LSL usa

LSL não é WebSocket, HTML ou Bluetooth. Ele é uma biblioteca de comunicação própria, a `liblsl`, que usa a rede local para anunciar, localizar e transportar streams.

Em termos práticos:

- a descoberta usa mecanismos de broadcast ou multicast UDP;
- a estimativa de offset temporal usa trocas de pacotes UDP semelhantes à lógica do NTP;
- o transporte dos dados é orientado a mensagens e herda a confiabilidade do TCP;
- o Inlet recebe amostras na ordem e pode receber amostras individuais ou lotes;
- o LSL não depende de um servidor externo de descoberta, como um serviço central ou zeroconf.

O WebSocket continua sendo usado no projeto para a comunicação entre Hub, dashboard, Unreal e integrações diretas. São duas camadas diferentes:

```text
Sensor/driver -> LSL -> Hub
Hub <-> WebSocket <-> Dashboard / Unreal / bridges
```

O tráfego LSL não é criptografado por padrão. Por isso, experimentos devem usar uma rede local protegida e controlada. Firewall, adaptadores virtuais e redes públicas podem impedir que um Outlet seja encontrado pelo Hub.

## 3. Onde o LSL entra no Hub

O fluxo atual da V0.4 é:

```text
Sensor ou simulador
  -> LSL Outlet
  -> LslDiscoveryProvider
  -> um LslManagedSensorAdapter por stream
  -> Sensor Manager
  -> sensor.preview ou lsl.raw
  -> JSONL da sessão
```

### 3.1 Provider LSL

O `LslDiscoveryProvider` é a porta de entrada do Hub para o LSL. Ele carrega `pylsl` de forma opcional e procura os Outlets quando o operador solicita **Scan**.

Se `pylsl` ou a biblioteca nativa necessária não estiver instalada, o Hub continua iniciando. Nesse caso, o provider aparece como indisponível no diagnóstico, enquanto simuladores, Polar H10, Unreal e outras integrações continuam podendo funcionar.

### 3.2 Descoberta de streams

Cada stream numérico distinto encontrado é tratado como um sensor independente. Respostas duplicadas do mesmo stream são reaproveitadas pelo seu `sensorId` estável. A V0.4 aceita streams com canais numéricos inteiros ou de ponto flutuante.

Streams de texto e markers são contabilizados como não suportados para operação nesta versão. Eles não recebem um card operacional nem entram automaticamente em `lsl.raw`.

O Hub preserva os metadados disponíveis, incluindo:

- nome e tipo do stream;
- `sourceId` e `uid`;
- host de origem;
- número de canais;
- taxa nominal;
- formato dos canais;
- labels, unidades e tipos dos canais.

### 3.3 Identificação estável

O Hub gera um `sensorId` estável a partir da identidade do stream, usando `sourceId`, nome e tipo. Quando `sourceId` não existe, o `uid` serve como fallback.

Isso permite que o mesmo stream reutilize o card depois de desaparecer e reaparecer, em vez de criar um sensor novo a cada Scan.

### 3.4 Adapter LSL

Existe um `LslManagedSensorAdapter` para cada stream descoberto. Esse adapter abre o `StreamInlet`, lê os metadados, solicita a correção temporal e recebe amostras em lotes por meio de `pull_chunk`.

O lote é importante porque streams rápidos, como ECG ou EEG, podem produzir muitas amostras por segundo. O Hub não precisa tratar cada amostra como uma nova operação de interface.

### 3.5 Sensor Manager

O Sensor Manager coordena os adapters e transforma o estado técnico em uma experiência simples para o operador. Ele sabe quais sensores foram descobertos, conectados, armados e anexados à sessão.

Cada sensor possui seu próprio:

- adapter;
- `sensorId`;
- estado de conexão;
- preview;
- metadados;
- gate de gravação;
- vínculo com o `runId` da sessão.

## 4. Preview, Arm, Attach e Detach

O fluxo foi separado para que o operador possa verificar um sensor antes de transformá-lo em dado oficial.

1. **Scan:** o Hub procura os Outlets LSL disponíveis.
2. **Connect:** o adapter abre o Inlet e começa a receber dados.
3. **Preview:** o dashboard mostra a amostra mais recente e o estado do stream. Preview não é dado oficial.
4. **Arm:** o sensor é selecionado para a próxima sessão.
5. **Attach:** quando existe um `runId`, o Hub abre o gate de gravação para aquele sensor.
6. **Recording:** lotes completos passam a ser publicados em `lsl.raw` e persistidos no JSONL.
7. **Detach:** o gate é fechado antes do adapter ser desligado, bloqueando amostras atrasadas.

O dashboard assina `sensor.status`, `sensor.preview` e `sensor.session` para a operação ao vivo. Ele não assina `lsl.raw` no monitoramento padrão, porque o lote completo pode ter alta frequência e já é persistido integralmente pelo Hub.

## 5. O simulador LSL

O comando `biofeedback-lsl-sim` cria um Outlet LSL real. Ele não pula o adapter nem injeta mensagens diretamente no WebSocket do Hub.

O caminho do simulador é o mesmo que será usado por um equipamento compatível:

```text
biofeedback-lsl-sim
  -> Outlet LSL real
  -> Scan do Hub
  -> Adapter LSL
  -> Preview ou gravação oficial
```

Por padrão, o simulador publica:

- dois canais `float32`;
- taxa nominal de 10 Hz;
- `signal_a`, uma onda seno;
- `signal_b`, uma onda cosseno;
- unidade genérica `a.u.`;
- timestamps produzidos por `pylsl.local_clock()`.

Ele valida descoberta, transporte, leitura em lotes, metadados e fluxo de gravação. Ele não representa um ECG, EEG ou sinal fisiológico real e não deve ser usado como evidência de qualidade biométrica.

## 6. O que é salvo no `lsl.raw`

Após o Attach, o Hub publica eventos no tópico `lsl.raw` e grava o envelope completo em uma linha UTF-8 do arquivo:

```text
data/sessions/session-<data>.jsonl
```

Cada evento contém, em resumo:

- identificação do evento: `id`, `topic` e `clientId`;
- horários operacionais: `collectedAt`, `hubReceivedAt` e `sessionTimeMs`;
- `sensorId`, `runId`, `source`, `deviceType` e sequência do lote;
- `sampleCount` e todas as amostras do lote;
- identidade e metadados do stream;
- canais, labels, unidades e formato;
- `lslTimestamp` original de cada amostra;
- `timeCorrectionSec` calculado pelo LSL;
- `correctedLslTimestamp`, quando a correção está disponível;
- estado de sincronização, como `warming-up`, `corrected`, `stale` ou fallback.

Um exemplo reduzido é:

```json
{
  "topic": "lsl.raw",
  "sensorId": "lsl-a1b2c3d4",
  "runId": "run-001",
  "source": "lsl",
  "stream": {
    "name": "Biofeedback Hub Test",
    "type": "TestSignal",
    "channelCount": 2,
    "nominalSrateHz": 10,
    "channelFormat": "float32"
  },
  "sampleCount": 10,
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
```

O Hub preserva o timestamp original e o corrigido. Na V0.4, ele não aplica dejitter nem força monotonicidade dos timestamps. A análise científica offline pode aplicar o processamento apropriado ao experimento e, quando necessário, utilizar XDF/LabRecorder.

Depois da leitura inicial na conexão, novas chamadas de `time_correction()` são executadas em background. Enquanto uma atualização está lenta, o adapter continua usando a última correção válida para `pull_chunk`, preview e gravação. Se a atualização falhar, o lote preserva o estado `stale` e a idade da correção, sem interromper a ingestão. Em uma reconexão, a correção volta ao estado de aquecimento e precisa ser obtida novamente.

Além de `lsl.raw`, são persistidos eventos de `sensor.status`, `sensor.session` e `experience.lifecycle`. O tópico `sensor.preview` é efêmero e não entra no JSONL oficial.

O logger usa uma fila limitada e um writer dedicado. A admissão da telemetria é assíncrona para preservar a captura; as transições de lifecycle aguardam a confirmação da escrita antes de alterar o estado autoritativo e serem distribuídas. Uma falha de disco é terminal, aparece no diagnóstico e não faz o writer reiniciar silenciosamente.

Comandos de controle seguem uma regra mais estrita: o ACK recebido só é
encaminhado depois que o próprio evento de ACK foi persistido. Se o dashboard
atingir o timeout, ele mantém a correlação por uma janela curta; um ACK tardio
atualiza o mesmo comando e a mesma execução, em vez de criar um segundo registro.
O histórico operacional pode ser limpo sem apagar o histórico usado no relatório.

## 7. Vários sensores e a decisão sobre tópicos

### O que acontece hoje

Todos os lotes LSL oficiais usam o tópico `lsl.raw`, mas cada evento identifica claramente sua origem. Por exemplo:

```text
lsl.raw | sensorId=lsl-polar-01 | stream.type=ECG | channels=[ECG]
lsl.raw | sensorId=lsl-muse-02  | stream.type=EEG | channels=[AF7,AF8,TP9,TP10]
```

Esses dados não são tratados como uma única amostra. Eles podem aparecer intercalados no JSONL, mas continuam separáveis por `sensorId`, `runId`, identidade do stream, canais, unidades e metadados.

### Por que não criar um tópico dinâmico por sensor agora

Um tópico como `lsl.<sensorId>.raw` parece separar os dados, mas cria problemas para consumidores:

- o dashboard e outras ferramentas precisariam descobrir novas assinaturas continuamente;
- cada sensor poderia gerar um formato de tópico diferente;
- filtros, permissões e validações ficariam mais complexos;
- o nome do tópico passaria a carregar identidade que já existe no payload.

Também não é seguro converter automaticamente `stream.type` em `ecg.raw` ou `eeg.raw`. O tipo informado pelo Outlet ajuda a descobrir o stream, mas não garante sozinho a semântica, a unidade, a qualidade ou o mapeamento científico do sinal.

### Modelo híbrido adotado

A decisão oficial é manter uma fonte bruta única e permitir separação controlada:

- `lsl.raw` continua sendo o registro original, genérico e auditável;
- cada evento deve carregar `sensorId` e `runId`;
- consultas e exports devem filtrar por `runId` e `sensorId`;
- uma versão futura poderá criar arquivos ou pacotes separados por sensor;
- um perfil aprovado pelo operador poderá mapear um stream conhecido para `ecg.raw`, `eeg.raw`, `imu.raw` ou outro tópico semântico;
- o dado semântico deverá manter referência ao evento bruto original;
- tópicos dinâmicos por `sensorId` não serão o contrato principal.

Assim, o Hub mantém um contrato simples na V0.4 sem perder a capacidade de organizar muitos sensores no relatório e na análise posterior.

## 8. Sincronização temporal: o que o LSL fornece

O LSL fornece timestamps associados às amostras e estimativas do deslocamento entre o relógio do Outlet e o relógio do Inlet. Essas informações permitem que o consumidor aplique uma correção temporal quando precisar comparar streams.

No fluxo atual do Hub:

- `lslTimestamp` preserva o valor original recebido do Outlet;
- `timeCorrectionSec` registra a correção conhecida;
- `correctedLslTimestamp` registra o timestamp após aplicar a correção disponível;
- `hubReceivedAt` informa quando o Hub tratou o lote, como referência operacional;
- durante o aquecimento ou quando a correção não está disponível, o estado indica a condição em vez de inventar uma precisão;
- o Hub não executa dejitter nem uma reconstrução científica offline na V0.4.

Isso é diferente de RTT do WebSocket, latência fisiológica ou latência render-to-photon do Quest. Cada medida responde a uma pergunta diferente.

## 9. Limites e próximos passos

### Implementado na V0.4

- provider LSL opcional;
- Scan de streams numéricos;
- um adapter por stream;
- metadados e preview no dashboard;
- Attach e gravação de lotes em `lsl.raw`;
- timestamps original e corrigido;
- simulador LSL real;
- diagnóstico de provider indisponível, erro e ausência de streams.

### Evolução recomendada

- integrar LabRecorder/XDF quando houver uma necessidade científica formal de armazenamento multi-stream;
- criar exports particionados por sensor sem remover o `lsl.raw` original;
- permitir perfis de experimento com mapeamentos semânticos aprovados;
- adicionar gráficos específicos por tipo de sinal após definir unidade, qualidade e contrato;
- tratar markers LSL e streams textuais em uma etapa própria;
- aplicar dejitter e sincronização offline com ferramenta e método definidos pela pesquisa.

## 10. Glossário rápido

- **Outlet:** aplicação que publica um stream LSL.
- **Inlet:** aplicação que recebe um stream LSL.
- **Stream:** conjunto de amostras com metadados, canais e tipo compatíveis.
- **Sample:** uma medição de todos os canais naquele instante.
- **Chunk:** lote de várias amostras transferido junto.
- **Provider:** componente do Hub que procura e registra fontes disponíveis.
- **Adapter:** componente que sabe conectar, ler e traduzir uma fonte para o Sensor Manager.
- **Sensor Manager:** coordenador dos sensores, estados, preview e vínculo com a sessão.
- **Attach:** momento em que o sensor passa a fazer parte da gravação oficial.
- **JSONL:** arquivo em que cada linha é um evento JSON independente.
- **XDF:** formato multi-stream usado pelo ecossistema LSL/LabRecorder para gravação científica.

## Síntese final

O LSL resolve uma parte especializada do problema: descobrir streams, transportá-los e fornecer informações temporais e metadados. O Biofeedback Hub continua necessário para transformar essa capacidade em uma experiência de coleta compreensível, controlada e rastreável.

Na V0.4, o Hub não mistura sensores diferentes. Ele usa `lsl.raw` como categoria bruta comum e mantém a identidade de cada stream em todos os eventos. A separação semântica ou física pode ser adicionada depois, com mapeamento explícito e sem perder o registro original.

## Referências

- [LSL - Introduction](https://labstreaminglayer.readthedocs.io/info/intro.html)
- [LSL - Network Connectivity](https://labstreaminglayer.readthedocs.io/info/network-connectivity.html)
- [LSL - Time Synchronization](https://labstreaminglayer.readthedocs.io/info/time_synchronization.html)
- [liblsl - Stream Inlets](https://labstreaminglayer.readthedocs.io/projects/liblsl/ref/inlet.html)
- [Decisão arquitetural LSL/Hub na V0.2](lsl-architecture-alignment.md)
- [Operação do adapter LSL na V0.4](lsl-adapter-v0-4.md)
