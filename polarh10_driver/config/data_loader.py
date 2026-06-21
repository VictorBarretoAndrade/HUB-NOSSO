import yaml
from pathlib import Path


class ConfigLoader:
    """
    Loads and provides structured access to the configuration file.
    """

    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = Path(config_path)
        self._config = self._load()

    def _load(self):
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_path}")

        with open(self.config_path, "r") as f:
            data = yaml.safe_load(f)

        if data is None:
            raise ValueError("Configuration file is empty")

        return data

    @property
    def raw(self):
        """Return the full raw config dictionary."""
        return self._config

    @property
    def mode(self):
        return self._config.get("mode", "stream")

    @property
    def bluetooth(self):
        return self._config.get("bluetooth", {})

    @property
    def ecg(self):
        return self._config.get("ecg", {})

    @property
    def recording(self):
        return self._config.get("recording", {})

    @property
    def gateway(self):
        return self._config.get("gateway", {})

    @property
    def stream(self):
        return self._config.get("stream", {})

    def get(self, *keys, default=None):
        """
        Safely access nested configuration values.

        Example:
        config.get("gateway", "port")
        """
        value = self._config
        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default
        return value


def load_config(path: str = "config.yaml"):
    """
    Convenience function to load configuration.
    """
    return ConfigLoader(path)