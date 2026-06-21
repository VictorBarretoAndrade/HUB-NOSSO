# Polar H10 HRV Streaming System

## Setup (First Step)

Before running the system, you must configure the Python environment.

### Using the provided script

```bash
chmod +x venv_setup.sh
./venv_setup.sh
```

This script will:
- create a virtual environment
- activate it
- install all dependencies

---

### Manual setup (alternative)

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Running the System

```bash
python main.py
```

The WebSocket server will start automatically.

---

## Overview

This project provides a **real-time HRV streaming pipeline** using the Polar H10 sensor. It acquires ECG data via Bluetooth, detects R-peaks, computes RR intervals and HRV metrics, and publishes them through a **WebSocket server** for consumption by external applications (mobile, web, backend services).

The primary goal is **low-latency streaming of physiological features**.

---

## End-to-End Pipeline

ECG (Polar H10) → R-peak Detection → RR Intervals → HRV Metrics → WebSocket → Client

---

## What This README Focuses On

This document is optimized for **consumers of the WebSocket stream**, explaining:

- how to connect
- what data is sent
- message format and semantics
- timing and reliability considerations

---

## WebSocket Server

### Default Endpoint

```
ws://localhost:8765
```

### External Access

For external applications (outside local network):

- expose the server publicly
- use TLS (recommended)

```
wss://your-domain/ws
```

---

## Message Format

Each message is a JSON object containing a packet sequence number, a list of ECG samples, and the latest computed physiological metrics when available.

### Example

```json
{
  "seq": 1,
  "samples": [123, 124, 121, 119],
  "metrics": {
    "rr": 0.82,
    "hr": 73.1,
    "rmssd": 32.5,
    "sdnn": 40.2,
    "pnn50": 0.12,
    "lf_hf": 1.8
  }
}

---

## Field Specification

### `timestamp`
- Type: float (seconds)
- Description: server-side timestamp when the packet was generated

---

### `rr`
- Type: float (seconds)
- Description: last RR interval (time between consecutive heartbeats)
- Source: R-peak detection
- Frequency: updated at each detected beat

---

### `hr`
- Type: float (beats per minute)
- Description: instantaneous heart rate derived from RR
- Formula: `HR = 60 / RR`

---

### `rmssd`
- Type: float
- Description: Root Mean Square of Successive Differences
- Interpretation: short-term parasympathetic activity
- Real-time suitability: **high**

---

### `sdnn`
- Type: float
- Description: Standard deviation of RR intervals
- Interpretation: overall HRV
- Real-time suitability: **limited (window dependent)**

---

### `pnn50`
- Type: float (0–1)
- Description: proportion of RR differences > 50 ms
- Interpretation: vagal activity indicator
- Real-time suitability: **limited (window dependent)**

---

## Metrics Reliability (Important)

| Metric | Real-time Reliability | Notes |
|------|----------------------|------|
| RR | High | Direct measurement |
| HR | High | Derived from RR |
| RMSSD | High | Stable in short windows |
| SDNN | Medium | Depends on buffer size |
| pNN50 | Medium | Sensitive to window |
| LF/HF | Not included | Not suitable for real-time |

---

## Update Rate

- Messages are emitted **continuously**
- RR/HR update on each detected heartbeat
- HRV metrics update based on internal buffer

Typical frequency:

- ~1–2 Hz for HR/metrics (depending on heart rate)

---

## Client Integration

### JavaScript Example

```javascript
const ws = new WebSocket("ws://localhost:8765");

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

---

### Python Example

```python
import websocket
import json

def on_message(ws, message):
    data = json.loads(message)
    print(data)

ws = websocket.WebSocketApp("ws://localhost:8765", on_message=on_message)
ws.run_forever()
```

---

## Data Semantics

Important behaviors for consumers:

- Messages are **stateless snapshots**, not streams of raw ECG
- Not all fields necessarily change every message
- RR may be absent if no new beat is detected (depending on implementation)
- Metrics depend on internal buffer history

---

## Latency Considerations

- Designed for **low latency**, not long-term accuracy
- Some metrics are **approximate in real time**
- For research-grade analysis:
  - store RR intervals
  - process offline

---

## Error Handling

Consumers should handle:

- connection drops
- malformed JSON (rare but possible)
- missing fields

Example defensive parsing:

```javascript
if (data.hr !== undefined) {
  // use HR
}
```

---

## Project Structure

```
polarh10_driver/
├── config/
├── core/
│   ├── hrv_metrics.py
│   ├── polar_client.py
│   ├── rpeak_detector.py
│   ├── signal_processor.py
│   ├── websocket_gateway.py
│   └── websocket_gateway_dashboard.py
├── main.py
```

---

## Design Notes

- No metric selection via config (all metrics are computed internally)
- Focus on real-time streaming performance
- WebSocket is the primary integration interface

---

## Recommended Usage

### Real-time applications

- dashboards
- VR/AR experiments
- biofeedback systems

### Offline analysis

- export RR data
- compute advanced metrics externally

---

## Future Improvements

- configurable metric pipeline
- authentication layer
- data persistence
- structured schema versioning

---

## License

NA
