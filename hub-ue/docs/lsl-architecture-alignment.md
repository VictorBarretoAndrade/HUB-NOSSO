# V0.2 - Alinhamento da arquitetura com LSL

Este documento registra a decisao arquitetural da V0.2: o Lab Streaming Layer
(LSL) entra no Hub como camada preferencial para sensores compativeis, mas nao
substitui o Hub, o dashboard, a sessao da experiencia, a Unreal, os markers, os
logs JSONL ou os relatorios.

## Objetivo

A V0.2 existe para evitar retrabalho antes de implementar o Sensor Manager e o
adapter LSL. A equipe precisa saber quais responsabilidades pertencem ao LSL e
quais continuam no Hub.

Nesta versao nao sera implementado `lsl_adapter`, nao sera adicionada
dependencia `pylsl` e nao havera mudanca de protocolo em runtime.

## Decisao arquitetural

- LSL deve ser a fonte/adapter preferencial para sensores que ja publiquem
  streams LSL ou que possam ser conectados a ferramentas LSL existentes.
- O futuro `lsl_adapter` sera um adapter do Sensor Manager, nao um substituto do
  Hub.
- O Hub continua sendo a camada operacional que organiza a sessao, a experiencia
  Unreal, a selecao de sensores, os logs e os relatorios.
- O driver Polar H10 atual continua valido como adapter especifico ou ponte
  temporaria enquanto isso for o caminho mais seguro para testes reais.

## Matriz simples de responsabilidades

| LSL resolve | Hub complementa | Hub implementa |
| --- | --- | --- |
| Discovery de streams LSL disponiveis na rede local. | Mostra streams encontrados como candidatos a sensor no dashboard. | Fluxo de escolha do usuario: preview, attach/detach e entrada oficial na sessao. |
| Transporte de amostras por inlet/outlet. | Converte a existencia do stream em estado operacional legivel. | Logs JSONL, relatorio local e historico da sessao. |
| Sincronizacao temporal entre fontes LSL. | Usa timestamps e metadados LSL para alinhar a leitura da sessao quando disponivel. | Timeline da experiencia, markers, pausas, comandos e correlacao com Unreal. |
| Stream metadata, como nome, tipo, canais e taxa quando disponivel. | Exibe metadados para ajudar o usuario a escolher o stream correto. | Modelo visual de sensores, qualidade, status e participacao na sessao. |
| Gravacao cientifica bruta via LabRecorder/XDF em etapa futura. | Referencia arquivos XDF como evidencia externa quando existirem. | Export operacional legivel do Hub, manifest da sessao e relatorio para a equipe. |

## Decisoes tecnicas especificas

- XDF/LabRecorder: nao implementar gravacao XDF no Hub agora. A decisao e
  aproveitar LabRecorder/XDF no pos-MVP ou quando o fluxo LSL estiver validado.
- Sincronizacao temporal: nao recriar sincronizacao propria para streams LSL. O
  Hub deve consumir timestamps/metadados LSL quando o adapter existir.
- Discovery de devices/streams: nao criar discovery generico paralelo antes de
  analisar LSL. Para sensores compativeis, a descoberta deve partir do LSL.
- Stream metadata: preservar nome, tipo, canais, taxa e origem quando o LSL
  fornecer esses dados. O Hub deve usar isso para UX, selecao e relatorio.
- Sensores nao-LSL: continuam possiveis por adapters especificos, mas cada caso
  deve justificar por que nao usa LSL.

## Responsabilidades do LSL

Quando um sensor ou software ja oferecer LSL, o Hub deve evitar duplicar o que o
LSL ja resolve bem:

- descoberta de streams na rede local;
- transporte de amostras por inlet/outlet;
- sincronizacao temporal entre fontes;
- metadados basicos de stream, como nome, tipo, canais e taxa quando disponivel;
- integracao futura com LabRecorder e arquivos XDF para registro bruto
  cientifico.

## Responsabilidades do Hub

Mesmo com LSL, o Hub continua necessario para:

- oferecer uma interface visual simples para usuarios nao tecnicos;
- permitir preview de sensores antes da sessao oficial;
- decidir quais sensores entram oficialmente na sessao;
- registrar attach/detach de sensores;
- integrar Unreal, comandos, estado da experiencia e markers;
- manter logs JSONL legiveis para auditoria local;
- gerar relatorios e exports operacionais da sessao;
- separar dados de teste/preview de dados oficiais salvos.

## Sensores sem LSL e qualidade temporal

O Hub nao deve ficar refem do LSL. LSL e o caminho preferencial para sensores
compativeis, mas sensores sem LSL continuam sendo uma rota oficial quando forem
necessarios para o experimento ou ja estiverem validados pela equipe.

A arquitetura deve aceitar tres tipos de fonte no Sensor Manager:

- `lsl`: stream recebido via futuro `lsl_adapter`;
- `direct_adapter`: sensor conectado por driver/adapter especifico, como Polar
  H10 ou outro dispositivo sem LSL;
- `simulator`: fonte de teste usada para desenvolvimento, demonstracao e
  validacao local.

Para sensores sem LSL, o adapter direto deve informar a origem e a qualidade do
timestamp sempre que possivel. A hierarquia recomendada e:

1. timestamp do proprio sensor, quando o dispositivo ou SDK fornece o tempo real
   da amostra;
2. timestamp do driver/adapter no momento de coleta ou recebimento da amostra;
3. timestamp do Hub no momento de chegada, apenas como fallback menos preciso.

Quando um sensor importante nao tiver LSL nativo, a equipe deve avaliar duas
rotas:

- manter `direct_adapter -> Sensor Manager -> Hub`, se isso for suficiente para
  V0 ou para a demo;
- criar uma ponte futura `driver -> LSL outlet`, se o sensor precisar entrar no
  mesmo fluxo de sincronizacao e gravacao cientifica dos streams LSL.

Essa decisao evita dois extremos ruins: depender de LSL para tudo e bloquear
sensores uteis, ou ignorar LSL e recriar transporte/sincronizacao que ele ja
resolve melhor.

## Modulos e ideias que devem esperar a analise do LSL

Estes itens nao devem ser implementados como solucoes proprias antes da analise
LSL, porque podem duplicar capacidades ja resolvidas por ele:

- discovery universal de sensores;
- protocolo proprio de sincronizacao temporal entre sensores;
- gravador bruto cientifico paralelo ao LabRecorder/XDF;
- modelo proprio de metadados de stream sem mapear metadados LSL;
- reprocessamento cientifico completo dentro do Hub;
- adapter generico que prometa suportar qualquer sensor automaticamente;
- export cientifico final antes de decidir como anexar XDF/streams ao pacote;
- conexao automatica ampla de sensores sem separar preview e entrada oficial na
  sessao.

## Fluxo proposto

O fluxo alvo para sensores compativeis com LSL e:

```text
Sensor fisico ou software de aquisicao
  -> LSL stream
  -> lsl_adapter futuro
  -> Sensor Manager
  -> Hub
  -> Dashboard / Report / Export
```

O `lsl_adapter` devera descobrir streams, ler metadados basicos e publicar
preview para o Sensor Manager. O dado so se torna oficial quando o usuario
anexa o sensor/stream a sessao.

## Preview versus dado oficial

Preview significa que o sensor pode aparecer no dashboard e mostrar amostras
recentes, mas ainda nao faz parte da coleta oficial. Esse comportamento e
importante para facilitar uso por pessoas nao tecnicas sem salvar dados
irrelevantes.

Dado oficial significa que o sensor foi anexado a sessao. A partir desse ponto,
o Hub deve registrar a participacao no lifecycle da sessao e preservar a
rastreabilidade nos logs e relatorios.

## Roadmap relacionado

- V0.2: documentar a fronteira LSL/Hub e aprovar a arquitetura.
- V0.3: criar Sensor Manager minimo com sensores configurados, disponiveis,
  conectados, em preview e anexados a sessao.
- V0.4: implementar `lsl_adapter` minimo para descobrir e consumir streams LSL.
- V0.5: manter Polar H10 e sensores reais validados dentro do novo modelo.
- Pos-MVP: evoluir LabRecorder/XDF, export cientifico versionado e processamento
  avancado.

## Recomendacao objetiva para V0.1, V0.2 e V0.3

- V0.1: manter como visualizacao da sessao e graficos de telemetria Unreal ja
  implementados. Nao reabrir essa versao para resolver sensores ou LSL.
- V0.2: aprovar esta decisao tecnica. A entrega e a matriz LSL/Hub, nao codigo.
- V0.3: implementar Sensor Manager minimo respeitando a matriz e aceitando
  fontes `lsl`, `direct_adapter` e `simulator`: listar sensores, exibir preview
  e controlar attach/detach sem recriar discovery/sync que o LSL deve resolver
  na V0.4.

## Fora de escopo da V0.2

- Implementar `lsl_adapter`.
- Adicionar `pylsl` ou qualquer dependencia nova de runtime.
- Alterar `docs/protocol.md` com topicos `sensor.*`.
- Substituir imediatamente o driver Polar H10.
- Gravar XDF final ou integrar LabRecorder no fluxo oficial.
- Reprocessar dados LSL ou criar pipeline cientifico completo.

## Criterios de aceite

A V0.2 esta aceita quando:

- a equipe entende que LSL nao substitui o Hub;
- a equipe entende que LSL deve evitar retrabalho em descoberta, transporte e
  sincronizacao;
- o ponto de entrada do LSL no Sensor Manager esta claro;
- V0.3 e V0.4 ficam separadas: Sensor Manager primeiro, adapter LSL depois;
- nao houve mudanca de runtime, protocolo, dashboard ou plugin Unreal nesta
  versao.

## DoD / Como validar

- O documento deixa claro o que nao deve ser reimplementado no Hub agora.
- O DoD bloqueia explicitamente `lsl_adapter`, `pylsl`, topicos `sensor.*`,
  XDF final, sincronizacao propria, discovery generico e modelo paralelo de
  metadata nesta versao.
- Existe recomendacao tecnica sobre XDF, streams, sincronizacao temporal,
  discovery e metadata.
- As proximas tarefas do Hub ficam alinhadas ao papel do LSL.
- Uma pessoa da equipe consegue revisar a decisao em ate 10 minutos.
