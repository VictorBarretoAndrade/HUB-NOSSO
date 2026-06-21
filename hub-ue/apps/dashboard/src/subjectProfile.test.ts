import { describe, expect, it } from "vitest";
import {
  createEmptySubjectProfile,
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

  // TODO(②/análise): validar faixas plausíveis e exigir posição de medição.
  it.todo("rejects implausible age / missing measurement position");
});
