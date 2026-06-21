import { describe, expect, it } from "vitest";
import {
  COMMAND_TOPIC,
  buildMonitorSubscribe,
  buildUnrealCommand,
  commandStatusFromAck,
  isAckForCommand,
} from "./api";

describe("dashboard hub protocol helpers", () => {
  it("keeps the monitoring subscription off the critical command topic", () => {
    const subscribe = buildMonitorSubscribe();

    expect(subscribe.type).toBe("subscribe");
    expect(subscribe.payload?.topics).toContain("unreal.state");
    expect(subscribe.payload?.topics).not.toContain(COMMAND_TOPIC);
  });

  it("builds pause-session as an ACK-required unreal.commands publish", () => {
    const command = buildUnrealCommand({
      action: "pause-session",
      arguments: { reason: "dashboard" },
    });

    expect(command.type).toBe("publish");
    expect(command.topic).toBe(COMMAND_TOPIC);
    expect(command.requiresAck).toBe(true);
    expect(command.clientId).toBe("dashboard-controller");
    expect(command.payload).toEqual({
      action: "pause-session",
      target: "all",
      arguments: { reason: "dashboard" },
    });
  });

  it("builds resume-session as an ACK-required unreal.commands publish", () => {
    const command = buildUnrealCommand({
      action: "resume-session",
      arguments: { reason: "dashboard" },
    });

    expect(command.type).toBe("publish");
    expect(command.topic).toBe(COMMAND_TOPIC);
    expect(command.requiresAck).toBe(true);
    expect(command.payload).toMatchObject({
      action: "resume-session",
      target: "all",
      arguments: { reason: "dashboard" },
    });
  });

  it("builds add-marker as an ACK-required unreal.commands publish", () => {
    const command = buildUnrealCommand({
      action: "add-marker",
      arguments: {
        reason: "dashboard",
        markerId: "marker-1",
        label: "stimulus-start",
        note: "first stimulus block",
      },
    });

    expect(command.type).toBe("publish");
    expect(command.topic).toBe(COMMAND_TOPIC);
    expect(command.requiresAck).toBe(true);
    expect(command.payload).toMatchObject({
      action: "add-marker",
      target: "all",
      arguments: {
        reason: "dashboard",
        markerId: "marker-1",
        label: "stimulus-start",
        note: "first stimulus block",
      },
    });
  });

  it("matches ACKs and derives final command status", () => {
    const command = buildUnrealCommand({ action: "pause-session" });
    const acceptedAck = {
      type: "ack" as const,
      clientId: "hub",
      correlationId: command.id,
      payload: { messageId: command.id, status: "accepted" },
    };
    const rejectedAck = {
      ...acceptedAck,
      payload: { messageId: command.id, status: "rejected", detail: "unsupported action" },
    };

    expect(isAckForCommand(acceptedAck, command)).toBe(true);
    expect(commandStatusFromAck(acceptedAck)).toBe("accepted");
    expect(commandStatusFromAck(rejectedAck)).toBe("rejected");
    expect(commandStatusFromAck({ ...acceptedAck, payload: { messageId: command.id } })).toBe("failed");
  });
});
