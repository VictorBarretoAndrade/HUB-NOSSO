from __future__ import annotations

from enum import Enum


class Topic(str, Enum):
    EXPERIENCE_LIFECYCLE = "experience.lifecycle"
    EXPERIENCE_MARKER = "experience.marker"
    UNREAL_STATE = "unreal.state"
    UNREAL_COMMANDS = "unreal.commands"
    SENSOR_COMMANDS = "sensor.commands"
    SENSOR_STATUS = "sensor.status"
    SENSOR_PREVIEW = "sensor.preview"
    SENSOR_SESSION = "sensor.session"
    HRV_RAW = "hrv.raw"
    LSL_RAW = "lsl.raw"
    HRV_PROCESSED = "hrv.processed"
    EEG_RAW = "eeg.raw"
    EEG_PROCESSED = "eeg.processed"
    BIOFEEDBACK_EVENTS = "biofeedback.events"
    AI_INPUT = "ai.input"
    AI_OUTPUT = "ai.output"
    LOGGER_EVENTS = "logger.events"
    SYSTEM_EVENTS = "system.events"
    SYSTEM_PING = "system.ping"
    SYSTEM_PONG = "system.pong"
