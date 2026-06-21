# Decision Log — Novas Features

Decisões que **travam o código** das exigências ①–④. Cada uma tem opções, uma
recomendação e um status. Resolver antes (ou no início) de cada fase.
Contexto: [PLANO-NOVAS-FEATURES.md](../../PLANO-NOVAS-FEATURES.md).

Status: 🔴 OPEN · 🟡 PROPOSTA · 🟢 DECIDIDA

| # | Decisão | Opções | Recomendação | Status |
|---|---|---|---|---|
| D1 | Dono do arquivo de ECG bruto | (a) Recorder no driver · (b) log JSONL do hub · (c) ambos | **(a)** para o massivo; (b) já existe como backup de tudo | 🟡 |
| D2 | Formato do arquivo bruto gravado | CSV · JSONL · NPY direto · Parquet | **NPY/CSV** simples na v1; Parquet depois | 🔴 |
| D3 | Local/nomenclatura dos arquivos | `data/recordings/<runId>_<device>_ecg.<ext>` | adotar esse padrão | 🟡 |
| D4 | Onde vive o exportador `.npy`/`.mat` | (a) `tools/` do driver (tem numpy/scipy) · (b) novo pacote · (c) hub + dep opcional | **(a)** no driver | 🟡 |
| D5 | Biblioteca de `.mat` | `scipy.io.savemat` · lib JS no browser | **scipy** server-side; browser não gera `.mat` | 🟢 |
| D6 | Transporte de `capture`/`subject` | (a) payload de `experience.lifecycle` · (b) tópico novo `session.subject` | **(a)** reusa o que a ponte já assina | 🟡 |
| D7 | Endpoint de export para o dashboard | (a) CLI manual · (b) `GET /export` no hub · (c) no driver | **(b)** se quiser botão "Salvar" 1-clique; senão (a) | 🔴 |
| D8 | Quando habilitar `/control` na ponte | manter `--disable-recording-control` até `/control` existir | remover a flag ao concluir ② | 🟢 |
| D9 | Persistência do `SubjectProfile` | só `localStorage` · `localStorage` + arquivo local | **localStorage** (LGPD; nada no git) | 🟢 |
| D10 | Perf da Live View (③) | SVG · Canvas + ring buffer · iframe da página do driver | **Canvas + ring buffer**; iframe como atalho de MVP | 🟡 |

## Notas

- **D1/D2/D3** são o caminho crítico da exigência ②/④ — sem definir, o `Recorder`
  (esqueleto em [recorder.py](../../polarh10_driver/core/recorder.py)) não fecha.
- **D6** afeta [protocol.md](protocol.md): o snapshot do sujeito e o `capture`
  entram no payload de `experience.lifecycle started`.
- **D8** já tem esqueleto: ver [control.py](../../polarh10_driver/core/control.py).
