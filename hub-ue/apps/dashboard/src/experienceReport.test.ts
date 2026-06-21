import { describe, expect, it } from "vitest";
import type { CommandHistoryItem } from "./commandHistory";
import {
  deriveAnalyticSessionTimeline,
  endExperienceRun,
  serializeExperienceRunJson,
  startExperienceRun,
} from "./experienceRun";
import {
  deriveExperienceReport,
  deriveExperienceReportHealth,
  commandIssueCount,
  serializeBiometricsSummaryCsv,
  serializeExperienceReportCsv,
  serializeExperienceReportJson,
  serializeMarkerSnapshotsCsv,
} from "./experienceReport";
import type { StreamEvent } from "./types";

function event(receivedAt: string, topic: string | null, payload: Record<string, unknown>, clientId = "unreal-quest-host"): StreamEvent {
  return {
    receivedAt,
    envelope: {
      type: "publish",
      clientId,
      topic,
      sessionTimeMs: 1200,
      payload,
    },
  };
}

function hrvEvent(receivedAt: string, payload: Record<string, unknown>, clientId = "heart-rate-sensor-1"): StreamEvent {
  return event(receivedAt, "hrv.raw", payload, clientId);
}

function command(status: CommandHistoryItem["status"], action = "pause-session"): CommandHistoryItem {
  return {
    action,
    messageId: `${action}-${status}`,
    sentAt: "2026-04-26T12:00:02.000Z",
    status,
    target: "all",
  };
}

describe("experience report", () => {
  it("derives session, biometric, marker, and command summaries", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:20.000Z");
    const events = [
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 80, rrMs: 750, ibiMs: [750], hrStatus: 1 }),
      hrvEvent("2026-04-26T12:00:04.000Z", { bpm: 90, rrMs: 666.7, ibiSampleCount: 2, hrStatus: 1 }),
      hrvEvent("2026-04-26T12:00:06.000Z", { bpm: 0, rrMs: 720, ibiMs: [720], hrStatus: -10 }),
      hrvEvent("2026-04-26T12:00:18.000Z", { bpm: 100, rrMs: 600, ibiMs: [600], hrStatus: 1 }),
      event("2026-04-26T12:00:05.000Z", "unreal.state", { state: "running", status: "online" }),
      event("2026-04-26T12:00:05.000Z", "experience.marker", {
        markerId: "m1",
        label: "stimulus-start",
        note: "block A",
        source: "xr",
      }),
    ];
    const timeline = deriveAnalyticSessionTimeline(events, run, 200);
    const report = deriveExperienceReport(run, timeline, events, [
      command("accepted"),
      command("rejected"),
      command("timeout", "add-marker"),
      command("failed", "resume-session"),
    ]);

    expect(report.summary).toMatchObject({
      durationMs: 20000,
      pausedMs: 0,
      markerCount: 1,
      stateChangeCount: 1,
      biometricObservationCount: 3,
      commandCount: 4,
    });
    expect(report.biometrics).toEqual([
      {
        sensorClientId: "heart-rate-sensor-1",
        sampleCount: 4,
        bpmMin: 80,
        bpmAvg: 90,
        bpmMax: 100,
        rrAvgMs: 684.2,
        ibiSampleCount: 5,
        firstSampleAt: "2026-04-26T12:00:02.000Z",
        lastSampleAt: "2026-04-26T12:00:18.000Z",
        poorObservationCount: 1,
        gapObservationCount: 1,
      },
    ]);
    expect(report.markers).toEqual([
      {
        id: "marker-m1",
        experienceTimeMs: 5000,
        label: "stimulus-start",
        note: "block A",
        detail: "block A; source xr; BPM 90; RR 666.7ms; IBI 2; signal streaming",
        source: "xr",
        sourceClientId: "unreal-quest-host",
        commandId: undefined,
        bpm: 90,
        rrMs: 666.7,
        sensorSignal: "streaming",
      },
    ]);
    expect(report.commands).toEqual({
      total: 4,
      accepted: 1,
      rejected: 1,
      timeout: 1,
      failed: 1,
      pending: 0,
    });
    expect(report.analytics.sensors[0].samples.map((sample) => [sample.experienceTimeMs, sample.bpm, sample.rrMs])).toEqual([
      [2000, 80, 750],
      [4000, 90, 666.7],
      [6000, 0, 720],
      [18000, 100, 600],
    ]);
    expect(commandIssueCount(report.commands)).toBe(3);
  });

  it("exports JSON with report data alongside summary and items", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:10.000Z");
    const events = [event("2026-04-26T12:00:02.000Z", "experience.marker", { markerId: "m1", label: "checkpoint" })];
    const timeline = deriveAnalyticSessionTimeline(events, run, 200);
    const report = deriveExperienceReport(run, timeline, events, [command("accepted")]);

    const json = JSON.parse(serializeExperienceRunJson(run, timeline, "2026-04-26T12:00:12.000Z", report));

    expect(json).toMatchObject({
      exportedAt: "2026-04-26T12:00:12.000Z",
      summary: { markerCount: 1 },
      report: {
        summary: { markerCount: 1, commandCount: 1 },
        commands: { accepted: 1 },
      },
    });
    expect(json.items).toHaveLength(1);
  });

  it("serializes a report-only JSON and a sectioned CSV for spreadsheet review", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:10.000Z");
    const events = [
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 84, rrMs: 714.3, ibiSampleCount: 2, hrStatus: 1 }),
      event("2026-04-26T12:00:04.000Z", "experience.marker", {
        markerId: "m1",
        label: "note, one",
        note: "line one\nline two",
        source: "dashboard",
      }),
    ];
    const timeline = deriveAnalyticSessionTimeline(events, run, 200);
    const report = deriveExperienceReport(run, timeline, events, [command("accepted")]);

    expect(JSON.parse(serializeExperienceReportJson(report, "2026-04-26T12:00:12.000Z", { timeline, commandHistory: [command("accepted")] }))).toMatchObject({
      schemaVersion: 1,
      exportedAt: "2026-04-26T12:00:12.000Z",
      summary: { durationMs: 10000, markerCount: 1 },
      report: {
        summary: { durationMs: 10000, markerCount: 1 },
        commands: { accepted: 1 },
        analytics: {
          sensors: [
            {
              sensorClientId: "heart-rate-sensor-1",
              stats: { sampleCount: 1 },
            },
          ],
          markers: [{ label: "note, one", experienceTimeMs: 4000 }],
        },
      },
      analytics: {
        sensors: [
          {
            sensorClientId: "heart-rate-sensor-1",
            stats: { sampleCount: 1 },
          },
        ],
      },
      sensors: [{ sensorClientId: "heart-rate-sensor-1", sampleCount: 1 }],
      timeline: [{ kind: "marker", title: "note, one", note: "line one\nline two", bpm: 84, rrMs: 714.3 }],
      commandHistory: [{ status: "accepted", action: "pause-session" }],
    });

    const csv = serializeExperienceReportCsv(report);
    expect(csv).toContain("Session Summary\nmetric,value");
    expect(csv).toContain("Biometrics Summary\nsensorClientId,sampleCount,bpmMin,bpmAvg,bpmMax,rrAvgMs,ibiSampleCount");
    expect(csv).toContain("Marker Snapshots\nexperienceTimeMs,experienceTime,label,note,source,sourceClientId,commandId,bpm,rrMs,sensorSignal,detail");
    expect(csv).toContain('4000,00:00:04,"note, one","line one\nline two",dashboard,unreal-quest-host,,84,714.3,streaming,"line one\nline two; source dashboard; BPM 84; RR 714.3ms; IBI 2; signal streaming"');
    expect(csv).toContain("Command Outcomes\nstatus,count\naccepted,1");
  });

  it("serializes focused marker and biometric CSV exports", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:10.000Z");
    const events = [
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 84, rrMs: 714.3, ibiSampleCount: 2, hrStatus: 1 }),
      event("2026-04-26T12:00:04.000Z", "experience.marker", {
        markerId: "m1",
        label: "checkpoint",
        source: "xr",
      }),
    ];
    const timeline = deriveAnalyticSessionTimeline(events, run, 200);
    const report = deriveExperienceReport(run, timeline, events, [command("accepted")]);

    expect(serializeMarkerSnapshotsCsv(report)).toContain(
      "experienceTimeMs,experienceTime,label,note,source,sourceClientId,commandId,bpm,rrMs,sensorSignal,detail\n4000,00:00:04,checkpoint,,xr,unreal-quest-host,,84,714.3,streaming",
    );
    expect(serializeBiometricsSummaryCsv(report)).toContain(
      "sensorClientId,sampleCount,bpmMin,bpmAvg,bpmMax,rrAvgMs,ibiSampleCount,firstSampleAt,lastSampleAt,poorObservationCount,gapObservationCount\nheart-rate-sensor-1,1,84,84,84,714.3,2",
    );
    expect(commandIssueCount(report.commands)).toBe(0);
  });

  it("derives report health flags for missing biometrics, missing markers, sensor gaps, and command issues", () => {
    const run = endExperienceRun(startExperienceRun("2026-04-26T12:00:00.000Z"), "2026-04-26T12:00:30.000Z");
    const completeEvents = [
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 84, rrMs: 714, hrStatus: 1 }),
      event("2026-04-26T12:00:03.000Z", "experience.marker", { markerId: "m1", label: "checkpoint" }),
    ];
    const completeReport = deriveExperienceReport(run, deriveAnalyticSessionTimeline(completeEvents, run, 200), completeEvents, [command("accepted")]);

    expect(deriveExperienceReportHealth(completeReport)).toMatchObject({
      primary: "ready",
      label: "Ready",
      tone: "ok",
      flags: ["ready"],
    });

    const noBiometricsEvents = [event("2026-04-26T12:00:03.000Z", "experience.marker", { markerId: "m1", label: "checkpoint" })];
    const noBiometricsReport = deriveExperienceReport(
      run,
      deriveAnalyticSessionTimeline(noBiometricsEvents, run, 200),
      noBiometricsEvents,
      [command("accepted")],
    );
    expect(deriveExperienceReportHealth(noBiometricsReport).flags).toContain("no_biometrics");

    const noMarkersEvents = [hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 84, rrMs: 714, hrStatus: 1 })];
    const noMarkersReport = deriveExperienceReport(run, deriveAnalyticSessionTimeline(noMarkersEvents, run, 200), noMarkersEvents, [command("accepted")]);
    expect(deriveExperienceReportHealth(noMarkersReport).flags).toContain("no_markers");

    const gapEvents = [
      hrvEvent("2026-04-26T12:00:02.000Z", { bpm: 84, rrMs: 714, hrStatus: 1 }),
      hrvEvent("2026-04-26T12:00:18.000Z", { bpm: 90, rrMs: 666, hrStatus: 1 }),
      event("2026-04-26T12:00:19.000Z", "experience.marker", { markerId: "m1", label: "checkpoint" }),
    ];
    const gapReport = deriveExperienceReport(run, deriveAnalyticSessionTimeline(gapEvents, run, 200), gapEvents, [command("timeout")]);
    expect(deriveExperienceReportHealth(gapReport)).toMatchObject({
      primary: "command_issues",
      tone: "error",
    });
    expect(deriveExperienceReportHealth(gapReport).flags).toEqual(expect.arrayContaining(["sensor_gaps", "command_issues"]));
  });
});
