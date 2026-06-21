"""Contratos Pydantic das novas features (Fase 0).

Espelham os tipos TypeScript do dashboard (subjectProfile.ts, captureProfile.ts,
exportFormats.ts). Campos camelCase para casar com o envelope no fio.

Ver PLANO-NOVAS-FEATURES.md. Estes modelos são o contrato compartilhado; a lógica
(gravação, exportação) é implementada no driver/tools, não aqui.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = 2

RecordingMode = Literal["stream", "record", "hybrid"]
SignalKind = Literal["ecg", "rr", "hr", "hrv", "eeg", "imu"]


class SubjectDemographics(BaseModel):
    model_config = ConfigDict(extra="allow")

    ageYears: int | None = None
    biologicalSex: str | None = None
    heightCm: float | None = None
    weightKg: float | None = None
    handedness: str | None = None
    measurementPosition: str | None = None


class SubjectConfounders(BaseModel):
    model_config = ConfigDict(extra="allow")

    caffeineHoursAgo: float | None = None
    nicotineRecent: bool | None = None
    alcoholLast24h: bool | None = None
    sleepHours: float | None = None
    exerciseRecent: bool | None = None
    lastMealHoursAgo: float | None = None
    medication: str | None = None
    stressLevel: str | None = None
    conditions: list[str] = Field(default_factory=list)


class SubjectProfile(BaseModel):
    """Cadastro pseudônimo — NUNCA dado pessoal identificável (LGPD)."""

    model_config = ConfigDict(extra="allow")

    schemaVersion: int = SCHEMA_VERSION
    subjectId: str = Field(min_length=1)
    demographics: SubjectDemographics = Field(default_factory=SubjectDemographics)
    confounders: SubjectConfounders = Field(default_factory=SubjectConfounders)
    consentAt: str | None = None
    updatedAt: str | None = None


class SensorSelection(BaseModel):
    clientId: str = Field(min_length=1)
    signals: list[SignalKind] = Field(default_factory=list)


class CaptureProfile(BaseModel):
    schemaVersion: int = SCHEMA_VERSION
    mode: RecordingMode = "stream"
    sensors: list[SensorSelection] = Field(default_factory=list)
    rawEcg: bool = False


class RecordingControl(BaseModel):
    """Mensagem enviada pela ponte ao driver em ws://localhost:8765/control."""

    type: Literal["recording"] = "recording"
    action: Literal["start", "stop"]
    runId: str | None = None
    capture: CaptureProfile | None = None
    label: str | None = None
    reason: str | None = None
    source: str | None = None
    timestamp: str | None = None


class ExportEnvelopeV2(BaseModel):
    """Cabeçalho comum a todo export server-side (.npy/.mat) com contexto fisiológico."""

    model_config = ConfigDict(extra="allow")

    schemaVersion: int = SCHEMA_VERSION
    exportedAt: str
    subject: SubjectProfile | None = None
    capture: CaptureProfile | None = None
    run: dict[str, Any] | None = None
