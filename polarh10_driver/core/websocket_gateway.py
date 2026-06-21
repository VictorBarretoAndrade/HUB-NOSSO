import asyncio
import logging

from fastapi import FastAPI, WebSocket
import uvicorn


# Logging messages
LOG_CLIENT_CONNECTED = "Client connected"
LOG_CLIENT_DISCONNECTED = "Client disconnected"

# Server configuration
DEFAULT_BROADCAST_INTERVAL_SEC = 1

# Error handling
GENERIC_EXCEPTION = Exception


class WebSocketGateway:
    """WebSocket gateway for real-time streaming of processed data."""

    def __init__(self, config, data_source):
        """
        Initialize WebSocket gateway.

        Parameters
        ----------
        config : ConfigParser or similar
            Configuration source containing gateway parameters.
        data_source : object
            Asynchronous data provider exposing `get_packet()`.
        """
        self.config = config
        self.data_source = data_source

        self.host = config.get("gateway", "host")
        self.port = config.get("gateway", "port")
        self.path = config.get("gateway", "websocket_path")

        self.app = FastAPI()
        self.clients = []

        self._configure_routes()

    def _configure_routes(self):
        """Configure WebSocket routes for client connections."""

        @self.app.websocket(self.path)
        async def websocket_endpoint(ws: WebSocket):
            """
            Handle lifecycle of a WebSocket client connection.

            Maintains connection alive and tracks active clients.
            """
            await ws.accept()
            self.clients.append(ws)

            logging.info(LOG_CLIENT_CONNECTED)

            try:
                # Keep connection alive without consuming CPU
                while True:
                    await asyncio.sleep(DEFAULT_BROADCAST_INTERVAL_SEC)

            except GENERIC_EXCEPTION:
                # Remove disconnected client from registry
                if ws in self.clients:
                    self.clients.remove(ws)

                logging.info(LOG_CLIENT_DISCONNECTED)

    async def broadcast(self, data):
        """
        Send data to all connected clients.

        Parameters
        ----------
        data : dict
            Packet to be serialized and transmitted via WebSocket.
        """
        # Iterate over a copy to allow safe removal during iteration
        for client in list(self.clients):
            try:
                await client.send_json(data)

            except GENERIC_EXCEPTION:
                # Remove clients that fail during transmission
                if client in self.clients:
                    self.clients.remove(client)

    async def data_loop(self):
        """
        Continuously consume data from source and broadcast to clients.

        This loop acts as the bridge between the processing pipeline
        and the WebSocket layer.
        """
        while True:
            packet = await self.data_source.get_packet()
            await self.broadcast(packet)

    async def start(self):
        """
        Start WebSocket server and background data streaming loop.
        """
        logging.info(f"Starting WebSocket server {self.host}:{self.port}")

        # Run data loop concurrently with the server
        asyncio.create_task(self.data_loop())

        config = uvicorn.Config(
            self.app,
            host=self.host,
            port=self.port,
        )

        server = uvicorn.Server(config)

        await server.serve()