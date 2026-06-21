import asyncio
import logging
import time

from bleak import BleakScanner
from polar_python import PolarDevice, MeasurementSettings, SettingType, ECGData

from core.signal_processor import SignalProcessor


# Logging messages
LOG_SEARCHING_DEVICE = "Searching Polar device..."
LOG_DEVICE_RESOLVED = "Polar device resolved"
LOG_STARTING_STREAM = "Starting ECG stream"

# Packet configuration
PACKET_TYPE_ECG = "ecg"

# ECG data attribute candidates (library-dependent variability)
ECG_SAMPLE_KEYS = ("samples", "values", "ecg", "data")

# Measurement configuration
MEASUREMENT_TYPE_ECG = "ECG"
SETTING_SAMPLE_RATE = "SAMPLE_RATE"
SETTING_RESOLUTION = "RESOLUTION"


class PolarClient:
    """Client responsible for connecting to a Polar device and streaming ECG data."""

    def __init__(self, config):
        """
        Initialize client with configuration.

        Parameters
        ----------
        config : ConfigParser or similar
            Configuration source containing Bluetooth and ECG parameters.
        """
        self.config = config
        self.device_address = config.get("bluetooth", "device_address")

        self.seq = 0
        self.queue = asyncio.Queue()

        self.processor = SignalProcessor(config)

    async def connect(self):
        """
        Resolve the Polar device using its Bluetooth address.

        Raises
        ------
        RuntimeError
            If the device cannot be found.
        """
        logging.info(LOG_SEARCHING_DEVICE)

        device = await BleakScanner.find_device_by_address(self.device_address)

        if device is None:
            raise RuntimeError("Polar device not found")

        self.device = device

        logging.info(LOG_DEVICE_RESOLVED)

    async def start_stream(self):
        """
        Start ECG streaming and enqueue processed packets asynchronously.
        """
        logging.info(LOG_STARTING_STREAM)

        loop = asyncio.get_running_loop()

        def data_callback(data):
            """
            Callback executed on incoming BLE data.

            Filters ECG data, extracts samples, processes metrics,
            and pushes structured packets into the async queue.
            """

            # Ensure data type is ECG
            if not isinstance(data, ECGData):
                return

            samples = None

            # Handle variability across Polar SDK versions
            for key in ECG_SAMPLE_KEYS:
                if hasattr(data, key):
                    samples = getattr(data, key)
                    break

            if samples is None:
                return

            samples = list(samples)

            self.seq += 1

            packet = {
                "type": PACKET_TYPE_ECG,
                "seq": self.seq,
                "timestamp": time.time(),
                "samples": samples,
            }

            # Process signal and attach latest metrics if available
            metrics_results = self.processor.process(samples)

            if metrics_results:
                packet["metrics"] = metrics_results[-1]

            # Thread-safe enqueue into asyncio loop
            loop.call_soon_threadsafe(self.queue.put_nowait, packet)

        self.polar = PolarDevice(self.device, data_callback)

        await self.polar.__aenter__()

        # Configure ECG stream parameters
        settings = MeasurementSettings(
            measurement_type=MEASUREMENT_TYPE_ECG,
            settings=[
                SettingType(
                    type=SETTING_SAMPLE_RATE,
                    values=[self.config.get("ecg", "sample_rate_hz")],
                ),
                SettingType(
                    type=SETTING_RESOLUTION,
                    values=[self.config.get("ecg", "resolution_bits")],
                ),
            ],
        )

        await self.polar.start_stream(settings)

    async def get_packet(self):
        """
        Retrieve next available packet from the processing queue.

        Returns
        -------
        dict
            Structured ECG packet with optional HRV metrics.
        """
        return await self.queue.get()