import asyncio
import logging

from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse
import uvicorn


LOG_CLIENT_CONNECTED = "Client connected"
LOG_CLIENT_DISCONNECTED = "Client disconnected"

KEEP_ALIVE_INTERVAL_SEC = 1


VIS_PAGE = """
<!DOCTYPE html>
<html>
<head>
<title>Polar H10 Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<style>
body{
    font-family: Arial;
}

#metrics{
    margin-bottom:20px;
}

.metric{
    display:inline-block;
    margin-right:30px;
    font-size:18px;
}
</style>

</head>

<body>

<h2>Polar H10 Physiological Monitor</h2>

<div id="metrics">

<div class="metric">HR: <span id="hr">--</span></div>
<div class="metric">RR: <span id="rr">--</span></div>
<div class="metric">RMSSD: <span id="rmssd">--</span></div>
<div class="metric">SDNN: <span id="sdnn">--</span></div>
<div class="metric">pNN50: <span id="pnn50">--</span></div>
<div class="metric">LF/HF: <span id="lfhf">--</span></div>

</div>

<canvas id="chart" width="1000" height="400"></canvas>

<script>

const MAX_POINTS = 800;

const ctx = document.getElementById('chart').getContext('2d');

const chart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'ECG',
            data: [],
            borderWidth: 1,
            pointRadius: 0
        }]
    },
    options: {
        animation: false,
        scales: {
            x: { display: false }
        }
    }
});

const ws = new WebSocket("ws://" + location.host + "/stream");

ws.onmessage = function(event){

    const packet = JSON.parse(event.data);

    if(packet.type !== "ecg")
        return;

    if(packet.samples){

        packet.samples.forEach(v => {

            chart.data.labels.push("");
            chart.data.datasets[0].data.push(v);

            if(chart.data.datasets[0].data.length > MAX_POINTS){
                chart.data.labels.shift();
                chart.data.datasets[0].data.shift();
            }

        });

        chart.update();
    }

    if(packet.metrics){

        if(packet.metrics.hr !== undefined)
            document.getElementById("hr").innerText = packet.metrics.hr.toFixed(1);

        if(packet.metrics.rr !== undefined)
            document.getElementById("rr").innerText = packet.metrics.rr.toFixed(3);

        if(packet.metrics.rmssd !== undefined)
            document.getElementById("rmssd").innerText = packet.metrics.rmssd.toFixed(2);

        if(packet.metrics.sdnn !== undefined)
            document.getElementById("sdnn").innerText = packet.metrics.sdnn.toFixed(2);

        if(packet.metrics.pnn50 !== undefined)
            document.getElementById("pnn50").innerText = packet.metrics.pnn50.toFixed(2);

        if(packet.metrics.lf_hf !== undefined)
            document.getElementById("lfhf").innerText = packet.metrics.lf_hf.toFixed(2);
    }

};

</script>

</body>
</html>
"""


class WebSocketGatewayDashboard:
    """WebSocket gateway with embedded dashboard for real-time ECG visualization."""

    def __init__(self, config, data_source):
        self.config = config
        self.data_source = data_source

        self.host = config.get("gateway", "host")
        self.port = config.get("gateway", "port")
        self.path = config.get("gateway", "websocket_path")

        self.app = FastAPI()
        self.clients = []

        self._configure_routes()

    def _configure_routes(self):

        @self.app.get("/")
        async def dashboard():
            return HTMLResponse(VIS_PAGE)

        @self.app.websocket(self.path)
        async def websocket_endpoint(ws: WebSocket):

            await ws.accept()
            self.clients.append(ws)

            logging.info(LOG_CLIENT_CONNECTED)

            try:
                while True:
                    await asyncio.sleep(KEEP_ALIVE_INTERVAL_SEC)

            except Exception:
                if ws in self.clients:
                    self.clients.remove(ws)

                logging.info(LOG_CLIENT_DISCONNECTED)

    async def broadcast(self, data):

        for client in list(self.clients):

            try:
                await client.send_json(data)

            except Exception:
                if client in self.clients:
                    self.clients.remove(client)

    async def data_loop(self):

        while True:
            packet = await self.data_source.get_packet()
            await self.broadcast(packet)

    async def start(self):

        logging.info(f"Starting WebSocket server {self.host}:{self.port}")

        asyncio.create_task(self.data_loop())

        config = uvicorn.Config(self.app, host=self.host, port=self.port)
        server = uvicorn.Server(config)

        await server.serve()