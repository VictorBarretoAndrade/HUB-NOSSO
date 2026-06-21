import numpy as np
from scipy.signal import welch
from scipy.integrate import trapezoid


# Buffer configuration
MAX_BUFFER_SIZE = 256
MIN_RR_SAMPLES = 3

# Physiological constraints (seconds)
MIN_RR_INTERVAL = 0.3
MAX_RR_INTERVAL = 2.0

# Time-domain HRV parameters
HR_MOVING_AVG_WINDOW = 5
NN50_THRESHOLD = 0.05  # 50 ms

# Frequency-domain HRV parameters
MIN_SPECTRAL_SAMPLES = 20
INTERPOLATION_FS = 4.0  # Hz
MIN_INTERP_POINTS = 4
MAX_WELCH_SEGMENT = 256

# Frequency bands (Hz)
LF_LOW = 0.04
LF_HIGH = 0.15
HF_LOW = 0.15
HF_HIGH = 0.40


class HRVMetrics:
    """Compute time- and frequency-domain HRV metrics from RR intervals."""

    def __init__(self):
        """Initialize RR buffer with fixed maximum capacity."""
        self.rr_buffer = []
        self.max_buffer = MAX_BUFFER_SIZE

    def update_rr(self, rr):
        """
        Insert a new RR interval into the buffer.

        Parameters
        ----------
        rr : float
            RR interval in seconds. Values outside physiological bounds
            are discarded to reduce artifact contamination.
        """

        if rr < MIN_RR_INTERVAL or rr > MAX_RR_INTERVAL:
            return

        self.rr_buffer.append(rr)

        # Maintain FIFO buffer behavior
        if len(self.rr_buffer) > self.max_buffer:
            self.rr_buffer.pop(0)

    def compute(self):
        """
        Compute HRV metrics based on the current RR buffer.

        Returns
        -------
        dict or None
            HRV metrics (hr, rmssd, sdnn, pnn50, lf_hf) or None if
            insufficient data is available.
        """

        if len(self.rr_buffer) < MIN_RR_SAMPLES:
            return None

        rr = np.array(self.rr_buffer)

        # Heart rate estimated from short moving average to improve stability
        window = min(HR_MOVING_AVG_WINDOW, len(rr))
        hr = 60.0 / np.mean(rr[-window:])

        # SDNN: overall variability (standard deviation of RR intervals)
        sdnn = np.std(rr, ddof=1) if len(rr) > 1 else None

        diff_rr = np.diff(rr)

        if len(diff_rr) > 0:
            # RMSSD: short-term variability sensitive to parasympathetic activity
            rmssd = np.sqrt(np.mean(diff_rr ** 2))

            # NN50: count of successive RR differences greater than 50 ms
            nn50 = np.sum(np.abs(diff_rr) > NN50_THRESHOLD)

            # pNN50: proportion of NN50 over total number of differences
            pnn50 = nn50 / len(diff_rr)
        else:
            rmssd = None
            pnn50 = None

        lf_hf = None

        # Frequency-domain analysis requires sufficient temporal coverage
        if len(rr) > MIN_SPECTRAL_SAMPLES:

            # Convert irregular RR intervals into cumulative time axis
            time_axis = np.cumsum(rr)

            # Generate uniformly sampled timeline for spectral analysis
            t_interp = np.arange(
                time_axis[0],
                time_axis[-1],
                1 / INTERPOLATION_FS
            )

            if len(t_interp) > MIN_INTERP_POINTS:

                # Interpolate RR signal to uniform sampling grid
                rr_interp = np.interp(t_interp, time_axis, rr)

                # Remove mean to avoid DC bias in PSD estimation
                rr_interp = rr_interp - np.mean(rr_interp)

                # Estimate power spectral density using Welch’s method
                freqs, psd = welch(
                    rr_interp,
                    fs=INTERPOLATION_FS,
                    nperseg=min(MAX_WELCH_SEGMENT, len(rr_interp))
                )

                # Define frequency masks for LF and HF bands
                lf_band = (freqs >= LF_LOW) & (freqs < LF_HIGH)
                hf_band = (freqs >= HF_LOW) & (freqs < HF_HIGH)

                # Integrate spectral power within each band
                lf = trapezoid(psd[lf_band], freqs[lf_band]) if np.any(lf_band) else 0
                hf = trapezoid(psd[hf_band], freqs[hf_band]) if np.any(hf_band) else 0

                # LF/HF ratio as sympathovagal balance proxy
                if hf > 0:
                    lf_hf = lf / hf

        return {
            "hr": float(hr) if hr is not None else None,
            "rmssd": float(rmssd) if rmssd is not None else None,
            "sdnn": float(sdnn) if sdnn is not None else None,
            "pnn50": float(pnn50) if pnn50 is not None else None,
            "lf_hf": float(lf_hf) if lf_hf is not None else None
        }