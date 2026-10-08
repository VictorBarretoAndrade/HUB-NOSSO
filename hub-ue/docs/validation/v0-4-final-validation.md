# Validação final da V0.4

## Objetivo

Este documento separa a evidência automatizada da evidência física da V0.4. A
separação é importante porque uma suíte local pode comprovar o comportamento do
Hub, do adapter LSL, da ponte e do dashboard, enquanto uma coleta com hardware
também depende do driver, da rede, do Quest e da operação do laboratório.

O PR da V0.4 é o [PR #17](https://github.com/Viperpog/hub-ue/pull/17), com base
em `HUB-Refinement`. Este registro não autoriza merge nem substitui a aprovação
do orientador.

## Evidência automatizada

Na revisão de fechamento, foram executadas as verificações abaixo na branch
`feature/v0-4-lsl-adapter-minimal`:

- testes Python do Hub: **140 testes concluídos, 1 teste opcional ignorado**, com resultado `OK`;
- `compileall` do código e dos testes Python: concluído sem erro;
- testes do dashboard: **155 testes concluídos em 14 arquivos**, com resultado aprovado;
- `typecheck` do dashboard: aprovado;
- `build` do dashboard: aprovado;
- testes da ponte Polar com servidores WebSocket simulados: reconexão do canal de lifecycle, novo `hello`, nova assinatura, falha isolada do endpoint `/control` e ausência de repetição automática de comando: aprovados;
- regressões de persistência: fila limitada, erro terminal do writer, lifecycle rejeitado sem alterar o `activeRunId`, flush no encerramento e cleanup cancelável: aprovadas;
- regressões do Sensor Manager: retry após falha de `Detach` ou `Disconnect`, exatamente um consumidor após a recuperação, rollback de `Attach`, rediscovery de stream stale e encerramento protegido contra cancelamento: aprovadas;
- regressões do dashboard: associação de comandos por `runId`, reconciliação de ACK tardio, preservação do histórico completo, limite apenas visual da lista e limpeza somente do histórico operacional: aprovadas.

O teste opcional ignorado depende do ambiente LSL real. O smoke reproduzível da
V0.4 continua disponível com `biofeedback-lsl-sim`; sua evidência deve ser
registrada junto do comando executado e do trecho de JSONL correspondente, sem
confundir o sinal sintético com uma medição fisiológica.

## O que deve ser comprovado no JSONL

Para uma sessão limpa de validação, o arquivo de sessão deve demonstrar:

- ausência de `sensor.preview` no JSONL;
- ausência de `lsl.raw` antes do Attach;
- lotes `lsl.raw` com `runId`, `sensorId`, metadados do stream e `sampleCount` durante o run;
- `lslTimestamp`, `timeCorrectionSec`, `correctedLslTimestamp`, `collectedAt` e estado de sincronização preservados;
- ausência de lotes oficiais depois do Detach;
- ausência de `system.ping` e `system.pong` no JSONL;
- `hubReceivedAt` atribuído pelo Hub, sem aceitar o horário informado pelo cliente;
- ordem dos eventos mantida até o flush final;
- erro do logger refletido em `/health` e `/status` quando a escrita falhar.

## Validação física de 27/08

Os resultados físicos de 27/08 devem ser apresentados como observações
separadas da suíte automatizada. Eles demonstraram sequências Polar contínuas
nos trechos registrados, mas também houve interrupção do driver e suspensão do
Quest. Não há evidência para afirmar cinco minutos contínuos de execução
conjunta sem interrupção.

### Baseline somente com Polar

- duração observada: 196,39 s;
- 350 pacotes, sequência 356 a 705;
- zero lacunas de sequência;
- 25.550 amostras de ECG;
- taxa aproximada: 130,18 Hz;
- p95 ponte para Hub: 0,504 ms.

### Trechos com Polar e Unreal

- trecho A: 351,58 s, 627 pacotes, sequência 7.075 a 7.701, zero lacunas, 45.771 amostras de ECG e 79 registros de Unreal; ocorreu suspensão do Quest, portanto o trecho não é declarado contínuo;
- trecho B: 162,87 s, 290 pacotes, sequência 7.739 a 8.028, zero lacunas, 21.170 amostras de ECG e taxa aproximada de 130,16 Hz;
- trecho C: 90,52 s, 161 pacotes, sequência 8.274 a 8.434, zero lacunas, 11.753 amostras de ECG, taxa aproximada de 130,17 Hz, 45 registros de Unreal e um marker; o ACK do marker foi aceito e o marker apareceu no registro.

Esses números comprovam o comportamento observado nos trechos disponíveis.
Eles não provam, sozinhos, ausência de falhas em toda a execução física nem
identificam definitivamente a causa histórica de qualquer alerta de 27/08.
Essa causa permanece sem comprovação e não deve ser atribuída ao `localStorage`
sem evidência adicional.

## Critérios de aprovação

### Hub e LSL

O runtime pode ser considerado tecnicamente aprovado quando os testes e o smoke
confirmarem que o provider LSL opcional não impede a inicialização, o stream
numérico é descoberto, o preview permanece efêmero, o Attach abre a gravação,
o Detach fecha o gate e o lote bruto chega ao JSONL sem amostras atrasadas.

### Integração externa Polar

A integração Polar deve receber um resultado separado. A sequência, a taxa ECG,
os timestamps do driver e os intervalos ponte para Hub devem ser conferidos em
uma coleta controlada. Uma interrupção do driver ou do Quest limita o alcance da
conclusão, mas não invalida automaticamente os testes do runtime do Hub.

## Evidências para anexar ao Notion

- link do PR #17 e dos commits da V0.4;
- saída resumida dos testes Python e do dashboard;
- captura de `/health` e `/status` com provider, clientes, logger e lifecycle;
- captura do card LSL com preview e metadados;
- trecho sanitizado do JSONL mostrando Attach, lotes, timestamps e Detach;
- registro físico de 27/08 com os trechos acima e a observação sobre a interrupção;
- saída do `biofeedback-doctor`;
- links para [a arquitetura do Hub](../architecture.md), [a operação do adapter LSL](../lsl-adapter-v0-4.md) e [o risco do driver Polar](../polar-driver-integration-risk.md).

Nenhum log bruto, vídeo, build, APK, pesquisa local ou dado pessoal deve ser
incluído no PR apenas para formar esta evidência. Esses materiais podem ser
preservados fora do repositório, com acesso controlado.
