import { describe, expect, it, vi } from "vitest";
import {
  COMMAND_TOPIC,
  DEFAULT_HUB_ENDPOINT,
  SENSOR_COMMAND_TOPIC,
  buildMarkerAnnotation,
  buildMarkerArguments,
  buildMonitorSubscribe,
  buildSensorCommand,
  buildUnrealCommand,
  commandStatusFromAck,
  describeHubError,
  isAckForCommand,
  publishUnrealCommand,
  validateHubEndpoint,
} from "./api";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(value: string): void {
    this.sent.push(value);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(envelope: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(envelope) });
  }
}

describe("dashboard hub protocol helpers", () => {
  it("keeps raw LSL data and command topics out of the monitoring subscription", () => {
    const subscribe = buildMonitorSubscribe();

    expect(subscribe.type).toBe("subscribe");
    expect(subscribe.payload?.topics).toContain("unreal.state");
    expect(subscribe.payload?.topics).toContain("sensor.status");
    expect(subscribe.payload?.topics).toContain("sensor.preview");
    expect(subscribe.payload?.topics).toContain("sensor.session");
    expect(subscribe.payload?.topics).not.toContain("lsl.raw");
    expect(subscribe.payload?.topics).not.toContain(COMMAND_TOPIC);
    expect(subscribe.payload?.topics).not.toContain(SENSOR_COMMAND_TOPIC);
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

  it("builds sensor commands as ACK-required sensor.commands publishes", () => {
    const command = buildSensorCommand({
      action: "sensor.session.attach",
      arguments: {
        sensorId: "sim-hrv-1",
        runId: "run-001",
        reason: "dashboard",
      },
    });

    expect(command.type).toBe("publish");
    expect(command.topic).toBe(SENSOR_COMMAND_TOPIC);
    expect(command.requiresAck).toBe(true);
    expect(command.clientId).toBe("dashboard-controller");
    expect(command.payload).toEqual({
      action: "sensor.session.attach",
      target: "single",
      arguments: {
        sensorId: "sim-hrv-1",
        runId: "run-001",
        reason: "dashboard",
      },
    });
  });

  it("builds sensor scan as an all-target command", () => {
    const command = buildSensorCommand({ action: "sensor.scan" });

    expect(command.topic).toBe(SENSOR_COMMAND_TOPIC);
    expect(command.payload).toMatchObject({
      action: "sensor.scan",
      target: "all",
    });
  });

  it("builds a pre-session sensor arm command", () => {
    const command = buildSensorCommand({
      action: "sensor.session.arm",
      arguments: { sensorId: "sim-hrv-1", reason: "dashboard" },
    });

    expect(command.requiresAck).toBe(true);
    expect(command.payload).toEqual({
      action: "sensor.session.arm",
      target: "single",
      arguments: { sensorId: "sim-hrv-1", reason: "dashboard" },
    });
  });

  it("reconciles an ACK that arrives after the command timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
    const command = buildUnrealCommand({ action: "pause-session" });
    const onLateResponse = vi.fn();

    try {
      const resultPromise = publishUnrealCommand(
        "http://127.0.0.1:8787",
        "",
        command,
        100,
        onLateResponse,
      );
      const socket = FakeWebSocket.instances[0];
      socket.open();

      await vi.advanceTimersByTimeAsync(100);
      await expect(resultPromise).resolves.toMatchObject({ status: "timeout" });
      expect(socket.readyState).toBe(FakeWebSocket.OPEN);

      socket.message({
        type: "ack",
        clientId: "hub",
        correlationId: command.id,
        payload: { messageId: command.id, status: "accepted" },
      });

      expect(onLateResponse).toHaveBeenCalledWith(
        expect.objectContaining({ status: "accepted", command }),
      );
      expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe("hub endpoint settings", () => {
  it("normalizes a valid endpoint and falls back to the default when empty", () => {
    expect(validateHubEndpoint(" http://192.168.0.10:8787/ ")).toEqual({ ok: true, endpoint: "http://192.168.0.10:8787" });
    expect(validateHubEndpoint("   ")).toEqual({ ok: true, endpoint: DEFAULT_HUB_ENDPOINT });
  });

  it("rejects endpoints that cannot build a WebSocket URL instead of throwing", () => {
    expect(validateHubEndpoint("127.0.0.1:8787").ok).toBe(false);
    expect(validateHubEndpoint("hub local").ok).toBe(false);
    expect(validateHubEndpoint("ftp://127.0.0.1:8787").ok).toBe(false);
  });

  it("explains network failures with the endpoint the operator should check", () => {
    expect(describeHubError(new TypeError("Failed to fetch"), "http://127.0.0.1:8787")).toContain("http://127.0.0.1:8787");
    expect(describeHubError(new Error("O hub respondeu HTTP 500 em /status."), "http://x")).toBe("O hub respondeu HTTP 500 em /status.");
  });
});

describe("marker builders", () => {
  const marker = { markerId: "marker-1", label: "  stimulus-start ", note: " " };

  it("builds add-marker arguments without an empty note", () => {
    expect(buildMarkerArguments(marker)).toEqual({ reason: "dashboard", markerId: "marker-1", label: "stimulus-start" });
    expect(buildMarkerArguments({ ...marker, note: " olhos fechados " })).toMatchObject({ note: "olhos fechados" });
  });

  it("publishes a direct experience.marker annotation bound to the active run", () => {
    const envelope = buildMarkerAnnotation({ ...marker, note: "olhos fechados" }, "run-1");
    expect(envelope).toMatchObject({
      type: "publish",
      topic: "experience.marker",
      clientId: "dashboard-ui",
      requiresAck: false,
      payload: {
        markerId: "marker-1",
        label: "stimulus-start",
        note: "olhos fechados",
        runId: "run-1",
        source: "dashboard",
      },
    });
    expect(buildMarkerAnnotation(marker).payload).not.toHaveProperty("runId");
  });
});
