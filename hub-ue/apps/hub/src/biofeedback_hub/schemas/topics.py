from __future__ import annotations

from enum import Enum


class Topic(str, Enum):
    EXPERIENCE_LIFECYCLE = "experience.lifecycle"
    EXPERIENCE_MARKER = "experience.marker"
    UNREAL_STATE = "unreal.state"
    UNREAL_COMMANDS = "unreal.commands"
    HRV_RAW = "hrv.raw"
    HRV_PROCESSED = "hrv.processed"
    EEG_RAW = "eeg.raw"
    EEG_PROCESSED = "eeg.processed"
    BIOFEEDBACK_EVENTS = "biofeedback.events"
    AI_INPUT = "ai.input"
    AI_OUTPUT = "ai.output"
    LOGGER_EVENTS = "logger.events"
    SYSTEM_EVENTS = "system.events"
