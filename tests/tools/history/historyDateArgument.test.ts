import { describe, expect, it } from "vitest";

import { isReliableHistoryDate } from "../../../src/tools/history/revisionArgument.js";

describe("dates Git reads reliably", () => {
  it("accepts calendar dates, optional times and relative spans", () => {
    for (const value of [
      "2026-11-01",
      "2026-11-01 14:30",
      "2026-11-01T14:30:05",
      "2 weeks ago",
      "1 day ago",
      "yesterday",
    ]) {
      expect(isReliableHistoryDate(value)).toBe(true);
    }
  });

  it("refuses what Git would silently ignore or misread", () => {
    for (const value of [
      "2999-01-01",
      "1969-12-31",
      "2026-02-31",
      "2026-13-01",
      "next week",
      "--all",
      "11/01/2026",
      "",
    ]) {
      expect(isReliableHistoryDate(value)).toBe(false);
    }
  });
});
