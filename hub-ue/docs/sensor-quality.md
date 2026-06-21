# Qualidade de sinal de sensores

Este guia descreve campos recomendados para qualquer sensor que publique telemetria no hub. O envelope e aberto, entao cada dispositivo pode enviar campos proprios, mas manter nomes consistentes ajuda o dashboard, os logs e os relatorios a comparar sinais de origens diferentes.

## Campos recomendados

```json
{
  "value": 72,
  "unit": "bpm",
  "bpm": 72,
  "rrMs": 833.33,
  "ibiMs": [832, 836],
  "signalQuality": "good",
  "statusCode": 1,
  "batchSize": 1,
  "sampleAgeMs": 28,
  "sequence": 42,
  "source": "generic-websocket-sensor",
  "device": "heart-rate-sensor-1"
}
```

- `value` e `unit`: valor principal quando o topico nao tem schema especifico.
- `bpm`, `rrMs`, `ibiMs`: campos recomendados para sinais cardiacos.
- `signalQuality`: `good`, `poor`, `stale`, `unknown` ou outro valor documentado pelo dispositivo.
- `statusCode`: codigo numerico nativo do sensor, quando existir.
- `batchSize`: quantidade de amostras agregadas no mesmo envio.
- `sampleAgeMs`: idade da amostra no momento da publicacao.
- `sequence`: contador monotonicamente crescente para detectar lacunas.
- `source`: driver, firmware, app ou gateway que gerou o payload.
- `device`: identificador humano ou tecnico do dispositivo fisico.

## Interpretacao no dashboard

O dashboard deve tratar payloads como telemetria aberta. Para sinais cardiacos, ele pode calcular BPM a partir de `rrMs` quando `bpm` nao estiver disponivel. Para sinais genericos, deve preservar o topico e os campos recebidos sem assumir fabricante.

Use `sampleAgeMs`, `sequence`, `batchSize` e o intervalo entre mensagens recebidas pelo hub para diferenciar:

- amostra recente;
- amostra atrasada;
- stream em lote;
- perda de pacotes;
- baixa confianca do sensor.
