import { describe, expect, it } from "vitest";
import {
  canAnnotateMarker,
  canDispatchAddMarker,
  canDispatchPauseSession,
  canDispatchResumeSession,
  commandObservedStateDetail,
  commandRecipients,
  commandRowClass,
  commandStatusTone,
  completeCommandHistoryItem,
  createPendingCommandHistoryItem,
} from "./commandHistory";
import type { HubClient, MessageEnvelope, StreamEvent } from "./types";

const command: MessageEnvelope = {
  id: "cmd-1",
  type: "publish",
  clientId: "dashboard-controller",
  topic: "unreal.commands",
  requiresAck: true,
  payload: {
    action: "pause-session",
    target: "all",
    arguments: { reason: "dashboard" },
  },
};

describe("command history", () => {
  it("creates a pending command item with sent timestamp", () => {
    const item = createPendingCommandHistoryItem(command, "2026-04-25T15:00:00.000Z");

    expect(item).toMatchObject({
      messageId: "cmd-1",
      action: "pause-session",
      target: "all",
      sentAt: "2026-04-25T15:00:00.000Z",
      status: "pending",
    });
  });

  it("fills ACK metadata and duration when command completes", () => {
    const pending = createPendingCommandHistoryItem(command, "2026-04-25T15:00:00.000Z");
    const ack: MessageEnvelope = {
      type: "ack",
      clientId: "hub",
      correlationId: "cmd-1",
      payload: {
        messageId: "cmd-1",
        status: "accepted",
        clientId: "unreal-quest-sim",
      },
    };

    const completed = completeCommandHistoryItem(pending, {
      status: "accepted",
      ack,
      completedAt: "2026-04-25T15:00:01.240Z",
    });

    expect(completed).toMatchObject({
      status: "accepted",
      ackStatus: "accepted",
      ackClientId: "unreal-quest-sim",
      completedAt: "2026-04-25T15:00:01.240Z",
      durationMs: 1240,
      detail: "ACK accepted",
    });
  });

  it("maps final statuses to visual tones and row classes", () => {
    expect(commandStatusTone("accepted")).toBe("ok");
    expect(commandStatusTone("pending")).toBe("warn");
    expect(commandStatusTone("rejected")).toBe("error");
    expect(commandStatusTone("timeout")).toBe("error");
    expect(commandStatusTone("failed")).toBe("error");
    expect(commandRowClass("accepted")).toBe("");
    expect(commandRowClass("timeout")).toBe("error-row");
  });

  it("returns only clients subscribed to unreal.commands as command recipients", () => {
    const clients: HubClient[] = [
      {
        clientId: "dashboard-ui",
        role: "dashboard",
        capabilities: ["monitoring"],
        subscriptions: ["unreal.state"],
        outboxSize: 0,
      },
      {
        clientId: "unreal-quest-sim",
        role: "unreal",
        capabilities: ["unreal"],
        subscriptions: ["unreal.commands"],
        outboxSize: 0,
      },
    ];

    expect(commandRecipients(clients).map((client) => client.clientId)).toEqual(["unreal-quest-sim"]);
  });

  it("does not allow pause dispatch when the observed session is already paused", () => {
    const clients: HubClient[] = [
      {
        clientId: "unreal-quest-sim",
        role: "unreal",
        capabilities: ["unreal"],
        subscriptions: ["unreal.commands"],
        outboxSize: 0,
      },
    ];

    expect(canDispatchPauseSession(clients, false, { state: "running" })).toBe(true);
    expect(canDispatchPauseSession(clients, false, { state: "paused" })).toBe(false);
    expect(canDispatchPauseSession(clients, true, { state: "running" })).toBe(false);
  });

  it("allows resume dispatch only when the observed session is paused", () => {
    const clients: HubClient[] = [
      {
        clientId: "unreal-quest-sim",
        role: "unreal",
        capabilities: ["unreal"],
        subscriptions: ["unreal.commands"],
        outboxSize: 0,
      },
    ];

    expect(canDispatchResumeSession(clients, false, { state: "paused" })).toBe(true);
    expect(canDispatchResumeSession(clients, false, { state: "running" })).toBe(false);
    expect(canDispatchResumeSession(clients, true, { state: "paused" })).toBe(false);
  });

  it("allows add-marker dispatch only with a command recipient and non-empty label", () => {
    const clients: HubClient[] = [
      {
        clientId: "unreal-quest-sim",
        role: "unreal",
        capabilities: ["unreal"],
        subscriptions: ["unreal.commands"],
        outboxSize: 0,
      },
    ];

    expect(canDispatchAddMarker(clients, false, "stimulus-start")).toBe(true);
    expect(canDispatchAddMarker(clients, false, "  ")).toBe(false);
    expect(canDispatchAddMarker(clients, true, "stimulus-start")).toBe(false);
    expect(canDispatchAddMarker([], false, "stimulus-start")).toBe(false);
  });

  it("allows annotating a marker locally without a command recipient", () => {
    expect(canAnnotateMarker(false, "stimulus-start")).toBe(true);
    expect(canAnnotateMarker(false, "  ")).toBe(false);
    expect(canAnnotateMarker(true, "stimulus-start")).toBe(false);
  });

  it("describes observed state confirmation for pause and resume commands", () => {
    const pause = completeCommandHistoryItem(createPendingCommandHistoryItem(command, "2026-04-25T15:00:00.000Z"), {
      status: "accepted",
      ack: null,
      completedAt: "2026-04-25T15:00:01.000Z",
      detail: "ACK accepted",
    });
    const resume = {
      ...pause,
      messageId: "cmd-2",
      action: "resume-session",
    };

    expect(commandObservedStateDetail(pause, { state: "paused", lastCommandId: "cmd-1" })).toBe("ACK accepted; state paused confirmed");
    expect(commandObservedStateDetail(resume, { state: "running", lastCommandId: "cmd-2" })).toBe("ACK accepted; state running confirmed");
    expect(commandObservedStateDetail(resume, { state: "paused", lastCommandId: "cmd-2" })).toBe("ACK accepted; waiting for state update");
  });

  it("describes observed marker event confirmation for add-marker commands", () => {
    const markerCommand: MessageEnvelope = {
      ...command,
      id: "cmd-marker",
      payload: {
        action: "add-marker",
        target: "all",
        arguments: {
          reason: "dashboard",
          markerId: "marker-1",
          label: "stimulus-start",
        },
      },
    };
    const item = completeCommandHistoryItem(createPendingCommandHistoryItem(markerCommand, "2026-04-25T15:00:00.000Z"), {
      status: "accepted",
      ack: null,
      completedAt: "2026-04-25T15:00:01.000Z",
      detail: "ACK accepted",
    });
    const events: StreamEvent[] = [
      {
        receivedAt: "2026-04-25T15:00:01.050Z",
        envelope: {
          type: "publish",
          clientId: "unreal-quest-sim",
          topic: "experience.marker",
          payload: {
            markerId: "marker-1",
            commandId: "cmd-marker",
            label: "stimulus-start",
          },
        },
      },
    ];

    expect(commandObservedStateDetail(item, { state: "running" }, events)).toBe("ACK accepted; marker event observed");
    expect(commandObservedStateDetail(item, { state: "running" }, [])).toBe("ACK accepted; waiting for marker event");
  });
});
