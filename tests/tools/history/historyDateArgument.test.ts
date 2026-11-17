import { describe, expect, it } from "vitest";

import {
  isReliableHistoryDate,
  toGitHistoryBoundary,
} from "../../../src/tools/history/historyDateArgument.js";

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

describe("toGitHistoryBoundary", () => {
  it("pins a bare date to the start or end of that day and leaves every other form alone", () => {
    expect(toGitHistoryBoundary("2026-09-07", "since")).toBe("2026-09-07 00:00:00");
    expect(toGitHistoryBoundary("2026-09-06", "until")).toBe("2026-09-06 23:59:59");
    expect(toGitHistoryBoundary("2026-09-07 05:26", "since")).toBe("2026-09-07 05:26");
    expect(toGitHistoryBoundary("2 weeks ago", "until")).toBe("2 weeks ago");
  });
});
