import { describe, expect, it } from "vitest";
import { buildExportJob, encodeNpyFloat64, resolveExportTarget } from "./exportFormats";

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

  // TODO(④): exportador server-side (.mat via scipy, ECG bruto do JSONL).
  it.todo("requests a server export for raw ECG");
});
