import numpy as np
import time

from core.rpeak_detector import RPeakDetector
from core.hrv_metrics import HRVMetrics


# Buffer and processing parameters

# Minimum duration (seconds) required before processing
MIN_BUFFER_DURATION_SEC = 2

# Number of samples removed after each processing step (sliding window)
BUFFER_TRIM_DURATION_SEC = 1

# Physiological RR limits (seconds)
MIN_RR_INTERVAL = 0.3
MAX_RR_INTERVAL = 2.0


class SignalProcessor:
    """Pipeline for ECG processing, R-peak detection, and HRV computation."""

    def __init__(self, config):
        """
        Initialize processing pipeline.

        Parameters
        ----------
        config : ConfigParser or similar
            Configuration source containing ECG parameters.
        """
        self.config = config
        self.sample_rate = config.get("ecg", "sample_rate_hz")

        self.detector = RPeakDetector(self.sample_rate)
        self.metrics = HRVMetrics()

        self.signal_buffer = []

        self.last_peak_index = None
        self.last_processed_peak = None

        self.global_index = 0
        self.last_metrics = None

    def process(self, samples):
        """
        Process incoming ECG samples and compute HRV metrics.

        Parameters
        ----------
        samples : list or array-like
            Incoming ECG samples.

        Returns
        -------
        list
            List containing the latest metrics packet (if available).
        """

        results = []

        # Append new samples to buffer
        self.signal_buffer.extend(samples)

        # Ensure minimum buffer length for reliable peak detection
        min_buffer_size = int(self.sample_rate * MIN_BUFFER_DURATION_SEC)
        if len(self.signal_buffer) < min_buffer_size:
            return results

        signal = np.array(self.signal_buffer)

        # Detect R-peaks in buffered signal
        peaks = self.detector.detect(signal)

        new_metrics = None

        for peak in peaks:

            peak_global = self.global_index + peak

            # Avoid reprocessing previously handled peaks
            if self.last_processed_peak and peak_global <= self.last_processed_peak:
                continue

            # Initialize first detected peak (no RR yet)
            if self.last_peak_index is None:
                self.last_peak_index = peak_global
                self.last_processed_peak = peak_global
                continue

            # Compute RR interval (seconds)
            rr_samples = peak_global - self.last_peak_index
            rr = rr_samples / self.sample_rate

            self.last_peak_index = peak_global
            self.last_processed_peak = peak_global

            # Reject physiologically implausible RR intervals
            if rr < MIN_RR_INTERVAL or rr > MAX_RR_INTERVAL:
                continue

            # Update HRV metrics
            self.metrics.update_rr(rr)
            computed = self.metrics.compute()

            # Build output packet
            packet = {
                "rr": rr,
                "timestamp": time.time(),
            }

            if computed:
                packet.update(computed)

            self.last_metrics = packet
            new_metrics = packet

        # Slide buffer forward to maintain real-time processing
        trim = int(self.sample_rate * BUFFER_TRIM_DURATION_SEC)
        self.signal_buffer = self.signal_buffer[trim:]
        self.global_index += trim

        # Emit latest computed metrics or last known state
        if new_metrics:
            results.append(new_metrics)

        elif self.last_metrics:
            packet = self.last_metrics.copy()
            packet["timestamp"] = time.time()
            results.append(packet)

        return results