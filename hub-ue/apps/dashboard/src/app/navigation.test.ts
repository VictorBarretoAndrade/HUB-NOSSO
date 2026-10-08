import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW, formatRoute, NAV_GROUPS, NAV_ITEMS, navItem, parseRoute } from "./navigation";

describe("navigation", () => {
  it("parses a view from the URL hash and falls back to the default view", () => {
    expect(parseRoute("#/clients")).toEqual({ view: "clients" });
    expect(parseRoute("#clients")).toEqual({ view: "clients" });
    expect(parseRoute("")).toEqual({ view: DEFAULT_VIEW });
    expect(parseRoute("#/does-not-exist")).toEqual({ view: DEFAULT_VIEW });
  });

  it("keeps the session tab only for the session view and only when it is a known tab", () => {
    expect(parseRoute("#/session/report")).toEqual({ view: "session", sessionTab: "report" });
    expect(parseRoute("#/session/unknown")).toEqual({ view: "session" });
    expect(parseRoute("#/topics/report")).toEqual({ view: "topics" });
  });

  it("round-trips every route through the hash format", () => {
    for (const item of NAV_ITEMS) {
      expect(parseRoute(formatRoute({ view: item.id }))).toEqual({ view: item.id });
    }
    expect(formatRoute({ view: "session", sessionTab: "timeline" })).toBe("#/session/timeline");
    expect(formatRoute({ view: "live", sessionTab: "timeline" })).toBe("#/live");
  });

  it("lists every view exactly once across the menu groups", () => {
    const ids = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(navItem("diagnostics").title).toBe("Diagnóstico do sistema");
  });
});
