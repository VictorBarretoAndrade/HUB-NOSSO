# Risco de integração com o driver externo Polar H10

## Objetivo

Este registro descreve um risco observado na integração entre o driver externo da Polar H10, a interface gráfica do driver, o gateway WebSocket e a ponte `biofeedback-polarh10`. Ele serve para comunicar o comportamento ao proprietário do driver e orientar o teste, sem alterar o código externo.

## Observação técnica

Na implementação atual do driver, a leitura proveniente da cinta é colocada em uma fila compartilhada. A interface do driver consome essa fila para atualizar a tela e o gateway WebSocket também consome a mesma fila para encaminhar os pacotes à ponte.

Quando dois consumidores retiram itens da mesma fila, cada pacote pode ser entregue a apenas um deles. Isso pode produzir uma destas aparências:

- a interface mostra dados, mas a ponte recebe lacunas;
- a ponte recebe dados, mas a interface fica sem atualização;
- a taxa aparente varia conforme a velocidade de cada consumidor;
- o Hub recebe sequências descontínuas sem que o Bluetooth necessariamente tenha perdido amostras.

A ponte do Hub agora mantém uma tentativa de reconexão com intervalo progressivo quando
o WebSocket do driver ou do Hub é encerrado. Isso reduz a duração da interrupção, mas
não recupera pacotes que deixaram de ser entregues pelo driver e não substitui a
verificação de continuidade da sequência.

O canal de lifecycle usa a mesma política de reconexão: a cada nova conexão, a
ponte envia `hello` e assina novamente `experience.lifecycle`. Se o endpoint
`/control` estiver indisponível, a falha é registrada e a ponte mantém o canal de
telemetria e a assinatura ativos. Comandos de gravação que falharam não são
repetidos automaticamente, porque repetir um `start` pode reiniciar buffers do
driver.

Esse risco é diferente de uma falha no Hub. O Hub pode preservar e diagnosticar a sequência que recebeu, mas não consegue recuperar um pacote que foi consumido por outro componente antes de chegar à ponte.

## Evidência necessária no teste

Para separar o comportamento do driver do comportamento do Hub, registrar em cada pacote:

- `sequence`: sequência atribuída pelo driver;
- `driverTimestamp`: timestamp presente no pacote do driver;
- `bridgeReceivedAt`: horário em que a ponte recebeu o pacote;
- `collectedAt`: timestamp usado como coleta, preferencialmente convertido de `driverTimestamp`;
- `hubReceivedAt`: horário atribuído pelo Hub no recebimento;
- taxa efetiva de ECG, calculada com `sequence` e `ecgSampleRateHz`;
- tamanho das filas e erro do logger no Hub.

O diagnóstico deve comparar duas rotas:

1. **Interface do driver + gateway:** representa o fluxo normalmente usado pelo operador e pode revelar disputa pela fila compartilhada.
2. **Terminal/gateway sem a interface consumindo a fila:** serve como controle operacional, desde que essa rota esteja prevista pelo proprietário do driver.

Se a rota de controle mantiver sequência contínua e a rota com interface apresentar lacunas, o problema está na distribuição interna do driver, não no transporte Hub→dashboard.

## Mensagem sugerida ao proprietário

> Durante a integração com o Hub, observamos que a interface e o gateway parecem consumir a mesma fila de pacotes do cliente Polar. Como uma fila comum entrega cada item a apenas um consumidor, a interface pode retirar um pacote que o gateway esperava encaminhar, causando lacunas de sequência. Poderiam confirmar se essa fila é compartilhada? A solução ideal seria distribuir cada pacote para consumidores independentes, usando uma fila por consumidor, um broadcast interno ou um buffer com cursores separados. Não alteramos o driver externo; estamos apenas registrando a hipótese e comparando a rota com interface à rota de controle.

## Limite da interpretação temporal

`driverTimestamp` representa o instante informado pelo driver. Ele não prova, sozinho, o instante físico de aquisição no relógio interno da cinta. O Hub preserva o timestamp do driver, registra `bridgeReceivedAt` na ponte e substitui qualquer `hubReceivedAt` enviado pelo cliente pelo horário real de processamento no Hub.

Assim, o atraso aproximado pode ser decomposto em:

`driverTimestamp → bridgeReceivedAt → hubReceivedAt → chegada ao navegador`

O primeiro intervalo depende do relógio e da semântica do driver; os intervalos seguintes são observáveis pela ponte, pelo Hub e pelo dashboard.

## Critério de decisão

O teste da V0.4 emitirá dois resultados separados:

- aprovação do Hub, da gravação JSONL, do dashboard e do diagnóstico de sequência;
- aprovação da integração externa com o driver Polar H10.

Uma reprovação da segunda parte não invalida automaticamente o runtime do Hub, mas impede declarar a integração Polar pronta para coleta científica até que a origem das lacunas seja esclarecida.
