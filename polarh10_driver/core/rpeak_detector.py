import numpy as np
from scipy.signal import find_peaks


# Detection parameters

# Minimum signal length required (in seconds of data)
MIN_SIGNAL_DURATION_SEC = 1

# Refractory period between R-peaks (seconds)
REFRACTORY_PERIOD_SEC = 0.35  # ~350 ms

# Percentile used for adaptive thresholding
PEAK_THRESHOLD_PERCENTILE = 97


class RPeakDetector:
    """Detect R-peaks in ECG signals using amplitude thresholding and distance constraints."""

    def __init__(self, fs):
        """
        Initialize detector.

        Parameters
        ----------
        fs : float
            Sampling frequency of the ECG signal (Hz).
        """
        self.fs = fs

        # Convert refractory period to samples
        self.min_distance = int(fs * REFRACTORY_PERIOD_SEC)

    def detect(self, signal):
        """
        Detect R-peak indices from an ECG signal.

        Parameters
        ----------
        signal : array-like
            Input ECG signal.

        Returns
        -------
        list
            Indices of detected R-peaks.
        """

        # Ensure sufficient signal length for reliable detection
        if len(signal) < int(self.fs * MIN_SIGNAL_DURATION_SEC):
            return []

        signal = np.asarray(signal)

        # Adaptive threshold based on high percentile of signal amplitude
        threshold = np.percentile(signal, PEAK_THRESHOLD_PERCENTILE)

        # Peak detection with amplitude and refractory constraints
        peaks, _ = find_peaks(
            signal,
            height=threshold,
            distance=self.min_distance,
        )

        return peaks