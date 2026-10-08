# Galaxy Watch Sensor Quality

This note documents the Galaxy Watch 7 `hrv.raw` diagnostics used by the hub and dashboard when the watch streams through Phone Bridge or Direct Wi-Fi.

The watch still publishes the same open-ended `MessageEnvelope` on topic `hrv.raw`. The dashboard should treat the payload as live telemetry and use the extra fields below to decide whether the displayed BPM is native, derived, or stale.

## Payload Fields

```json
{
  "bpm": 72,
  "nativeBpm": 72,
  "bpmSource": "sensor",
  "rrMs": 833.33,
  "ibiMs": [832, 836],
  "hrStatus": 1,
  "batchSize": 1,
  "sampleAgeMs": 28,
  "sequence": 42,
  "source": "samsung-health-sensor-sdk",
  "device": "galaxy-watch-7"
}
```

- `bpm`: value to display. It can be native Samsung BPM or derived from valid IBI/RR data.
- `nativeBpm`: original BPM value from the Samsung callback, before fallback derivation.
- `bpmSource`: `sensor` when Samsung supplied valid BPM, `ibi-derived` when BPM was derived from IBI/RR.
- `hrStatus`: Samsung heart-rate status. `1` is good in normal tests. Negative values such as `-10` usually mean poor native BPM confidence or wrist-contact trouble.
- `batchSize`: number of Samsung data points delivered in the callback.
- `sampleAgeMs`: age of the Samsung data point when the watch published it.

## Dashboard Interpretation

The dashboard can show a usable BPM when `bpmSource=ibi-derived`, even if `nativeBpm=0` and `hrStatus` is negative. In that case, the signal label should still be conservative because Samsung did not consider the native BPM reliable for that callback.

Use `sampleAgeMs` and `batchSize` to distinguish current signal quality from background throttling:

- Low `sampleAgeMs` and `batchSize=1` means the stream is fresh.
- Large `sampleAgeMs` means the watch is delivering older samples.
- Repeated `batchSize>1` means callbacks are being batched, often after screen-off or power policy changes.
- Long gaps between `sequence` values or hub timestamps mean the watch, phone bridge, or hub connection is dropping live samples.

## Validation Commands

Start the hub:

```powershell
.\.venv\Scripts\biofeedback-hub
```

Start the logger:

```powershell
.\.venv\Scripts\biofeedback-sim --mode logger
```

Start the phone app, connect to `ws://<PC-IP>:8787/ws`, then start the watch in `Phone Bridge` mode with `High frequency` checked.

Expected result:

- `/status` lists `galaxy-watch-7` with role `sensor`.
- The logger receives `hrv.raw` publishes every 1 to 3 seconds.
- Session JSONL logs include `bpm`, `nativeBpm`, `bpmSource`, `hrStatus`, `batchSize`, and `sampleAgeMs`.
