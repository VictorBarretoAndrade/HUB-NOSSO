import asyncio
import json
import websockets
import csv
import time

HOST = "ws://localhost:8765/stream"

LOG_FILE = "ecg_debug_log.csv"


async def main():

    async with websockets.connect(HOST) as ws:

        print("Connected to gateway")

        with open(LOG_FILE, "w", newline="") as f:

            writer = csv.writer(f)

            writer.writerow([
                "timestamp",
                "seq",
                "sample_index",
                "ecg_value",
                "rr",
                "hr",
                "rmssd",
                "sdnn",
                "pnn50",
                "lf_hf"
            ])

            while True:

                msg = await ws.recv()
                data = json.loads(msg)

                seq = data.get("seq")
                samples = data.get("samples", [])
                metrics = data.get("metrics")

                print("\n--- PACKET ---")
                print("SEQ:", seq)
                print("ECG samples:", len(samples))

                if metrics:
                    print("RR:", metrics.get("rr"))
                    print("HR:", metrics.get("hr"))
                    print("RMSSD:", metrics.get("rmssd"))
                    print("SDNN:", metrics.get("sdnn"))
                    print("pNN50:", metrics.get("pnn50"))
                    print("LF/HF:", metrics.get("lf_hf"))
                else:
                    print("No metrics yet")

                ts = time.time()

                for i, v in enumerate(samples):

                    writer.writerow([
                        ts,
                        seq,
                        i,
                        v,
                        metrics.get("rr") if metrics else None,
                        metrics.get("hr") if metrics else None,
                        metrics.get("rmssd") if metrics else None,
                        metrics.get("sdnn") if metrics else None,
                        metrics.get("pnn50") if metrics else None,
                        metrics.get("lf_hf") if metrics else None,
                    ])

                f.flush()


if __name__ == "__main__":
    asyncio.run(main())