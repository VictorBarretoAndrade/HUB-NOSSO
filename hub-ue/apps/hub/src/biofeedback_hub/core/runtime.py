from __future__ import annotations

from biofeedback_hub.clock import utc_now_iso
from biofeedback_hub.core.broker import TopicBroker
from biofeedback_hub.core.session_log import JsonlSessionLogger
from biofeedback_hub.schemas.envelope import AckPayload, MessageEnvelope, MessageType, TopicList


class HubRuntime:
    def __init__(self, broker: TopicBroker, session_logger: JsonlSessionLogger) -> None:
        self.broker = broker
        self.session_logger = session_logger

    async def handle_message(self, message: MessageEnvelope) -> list[str] | bool:
        stamped = self._stamp_received(message)
        self.broker.note_activity(stamped.clientId)

        if stamped.type == MessageType.SUBSCRIBE:
            request = TopicList.model_validate(stamped.payload)
            await self.broker.subscribe(
                stamped.clientId,
                request.topics,
            )
            self.session_logger.append(stamped)
            return True

        if stamped.type == MessageType.UNSUBSCRIBE:
            request = TopicList.model_validate(stamped.payload)
            await self.broker.unsubscribe(
                stamped.clientId,
                request.topics,
            )
            self.session_logger.append(stamped)
            return True

        if stamped.type == MessageType.PUBLISH:
            self.session_logger.append(stamped)
            return await self.broker.publish(stamped)

        if stamped.type == MessageType.ACK:
            ack = AckPayload.model_validate(stamped.payload)
            handled = await self.broker.acknowledge(
                ack.messageId,
                stamped.clientId,
                ack.status,
            )
            self.session_logger.append(stamped)
            return handled

        self.session_logger.append(stamped)
        return False

    def _stamp_received(self, message: MessageEnvelope) -> MessageEnvelope:
        if message.hubReceivedAt is not None:
            return message
        return message.model_copy(update={"hubReceivedAt": utc_now_iso()})
