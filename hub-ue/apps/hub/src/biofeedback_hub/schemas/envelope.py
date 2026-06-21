from __future__ import annotations

from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MessageType(str, Enum):
    HELLO = "hello"
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    PUBLISH = "publish"
    ACK = "ack"
    ERROR = "error"


class ClientRole(str, Enum):
    UNREAL = "unreal"
    SENSOR = "sensor"
    LOGGER = "logger"
    DASHBOARD = "dashboard"
    CONTROLLER = "controller"
    AI = "ai"
    SYSTEM = "system"


class ClientHello(BaseModel):
    model_config = ConfigDict(extra="allow")

    clientId: str = Field(min_length=1)
    role: str = Field(min_length=1)
    capabilities: list[str] = Field(default_factory=list)
    displayName: str | None = None
    deviceType: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("clientId", mode="before")
    @classmethod
    def normalize_client_id(cls, value: Any) -> str:
        return normalize_non_empty_string(value, "clientId")

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, value: Any) -> str:
        return normalize_non_empty_string(value, "role").lower()

    @field_validator("capabilities", mode="before")
    @classmethod
    def normalize_capabilities(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("capabilities must be a list")
        return [normalize_non_empty_string(item, "capability") for item in value]


class TopicList(BaseModel):
    topics: set[str]

    @field_validator("topics", mode="before")
    @classmethod
    def normalize_topics(cls, value: Any) -> set[str]:
        if not isinstance(value, (list, set, tuple)):
            raise ValueError("topics must be a list")
        return {normalize_topic(item) for item in value}


class AckPayload(BaseModel):
    messageId: str
    status: str = "accepted"
    detail: str | None = None


class ErrorPayload(BaseModel):
    code: str
    message: str
    detail: dict[str, Any] | None = None


class MessageEnvelope(BaseModel):
    model_config = ConfigDict(extra="allow")

    version: int = 1
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: MessageType
    topic: str | None = None
    clientId: str
    correlationId: str | None = None
    requiresAck: bool = False
    collectedAt: str | None = None
    hubReceivedAt: str | None = None
    sessionTimeMs: int | None = Field(default=None, ge=0)
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("clientId", mode="before")
    @classmethod
    def normalize_client_id(cls, value: Any) -> str:
        return normalize_non_empty_string(value, "clientId")

    @model_validator(mode="after")
    def require_topic_for_publish(self) -> "MessageEnvelope":
        if self.type == MessageType.PUBLISH and self.topic is None:
            raise ValueError("publish messages require topic")
        return self

    @field_validator("topic", mode="before")
    @classmethod
    def normalize_topic_name(cls, value: Any) -> str | None:
        if value is None:
            return None
        return normalize_topic(value)


def normalize_non_empty_string(value: Any, field_name: str) -> str:
    if isinstance(value, Enum):
        value = value.value
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} must not be empty")
    return normalized


def normalize_topic(value: Any) -> str:
    return normalize_non_empty_string(value, "topic")


def make_error(
    client_id: str,
    code: str,
    message: str,
    correlation_id: str | None = None,
) -> MessageEnvelope:
    return MessageEnvelope(
        type=MessageType.ERROR,
        clientId=client_id,
        correlationId=correlation_id,
        payload=ErrorPayload(code=code, message=message).model_dump(mode="json"),
    )
