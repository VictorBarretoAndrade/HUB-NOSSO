import { describe, expect, it } from "vitest";
import {
  createDemoSubjectProfile,
  createEmptySubjectProfile,
  isDemoSubjectProfile,
  loadSubjectProfile,
  saveSubjectProfile,
  subjectSnapshotForRun,
  validateSubjectForStart,
} from "./subjectProfile";
import type { SubjectProfile } from "./subjectProfile";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function confirmedProfile(): SubjectProfile {
  return {
    ...createEmptySubjectProfile("2026-06-21T00:00:00.000Z"),
    subjectId: "S-2026-014",
    consentAt: "2026-06-21T00:00:00.000Z",
  };
}

describe("subjectProfile", () => {
  it("blocks start without subjectId and consent", () => {
    expect(validateSubjectForStart(createEmptySubjectProfile())).toHaveLength(2);
  });

  it("passes validation when id and consent are present", () => {
    expect(validateSubjectForStart(confirmedProfile())).toEqual([]);
  });

  it("round-trips through storage", () => {
    const storage = new MemoryStorage();
    saveSubjectProfile(storage, confirmedProfile());
    const loaded = loadSubjectProfile(storage);
    expect(loaded?.subjectId).toBe("S-2026-014");
    expect(loaded?.confounders.conditions).toEqual([]);
  });

  it("freezes the run snapshot", () => {
    const snapshot = subjectSnapshotForRun(confirmedProfile());
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("flags an implausible age but accepts a missing one", () => {
    const withAge = (ageYears: number | undefined) => ({ ...confirmedProfile(), demographics: { ageYears } });
    expect(validateSubjectForStart(withAge(undefined))).toEqual([]);
    expect(validateSubjectForStart(withAge(34))).toEqual([]);
    expect(validateSubjectForStart(withAge(0))).toHaveLength(1);
    expect(validateSubjectForStart(withAge(340))).toHaveLength(1);
  });

  it("creates a valid demo participant profile and identifies demo vs real profiles", () => {
    const demo = createDemoSubjectProfile("2026-11-23T21:00:00.000Z");
    expect(validateSubjectForStart(demo)).toEqual([]);
    expect(isDemoSubjectProfile(demo)).toBe(true);
    expect(isDemoSubjectProfile(confirmedProfile())).toBe(false);
    expect(isDemoSubjectProfile(null)).toBe(false);
  });
});
