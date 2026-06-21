import { describe, expect, it } from "vitest";
import { createDefaultCaptureProfile } from "./captureProfile";
import { buildExportEnvelopeV2, buildExportJob, encodeNpyFloat64, resolveExportTarget } from "./exportFormats";
import { createEmptySubjectProfile, subjectSnapshotForRun } from "./subjectProfile";

describe("exportFormats", () => {
  it("routes massive/binary scopes to the server", () => {
    expect(resolveExportTarget("ecg", "npy")).toBe("server");
    expect(resolveExportTarget("ecg", "csv")).toBe("server");
    expect(resolveExportTarget("rr", "mat")).toBe("server");
  });

  it("keeps text and scalar npy on the client", () => {
    expect(resolveExportTarget("report", "json")).toBe("client");
    expect(resolveExportTarget("rr", "csv")).toBe("client");
    expect(resolveExportTarget("hr", "npy")).toBe("client");
  });

  it("builds a job with the derived target", () => {
    expect(buildExportJob("ecg", "mat").target).toBe("server");
  });

  it("encodes a valid .npy float64 buffer", () => {
    const bytes = encodeNpyFloat64([1, 2, 3]);
    // magic \x93NUMPY
    expect(Array.from(bytes.slice(0, 6))).toEqual([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);
    // header region is 64-byte aligned; payload is 3 * 8 bytes
    expect((bytes.length - 3 * 8) % 64).toBe(0);
  });

  it("wraps an export with subject and capture context (envelope v2)", () => {
    const subject = subjectSnapshotForRun({
      ...createEmptySubjectProfile("2026-06-21T00:00:00.000Z"),
      subjectId: "S-1",
    });
    const envelope = buildExportEnvelopeV2({
      exportedAt: "2026-06-21T00:00:00.000Z",
      subject,
      capture: createDefaultCaptureProfile(),
      run: { runId: "run-1" },
    });
    expect(envelope.schemaVersion).toBe(2);
    expect(envelope.subject?.subjectId).toBe("S-1");
    expect(envelope.capture?.mode).toBe("stream");
    expect(envelope.run?.runId).toBe("run-1");
  });

  // TODO(④): exportador server-side (.mat via scipy, ECG bruto do JSONL).
  it.todo("requests a server export for raw ECG");
});
