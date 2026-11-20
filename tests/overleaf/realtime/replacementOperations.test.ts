import { describe, expect, it } from "vitest";

import { replaceTextOccurrences } from "../../../src/latex/replaceTextOccurrences.js";
import type { DocumentOperation } from "../../../src/overleaf/realtime/overleafRealtimeSession.js";
import { buildReplacementOperations } from "../../../src/overleaf/realtime/replacementOperations.js";

/** Applies operations one after another, each against the text the previous one left, as Overleaf does. */
function applyInOrder(text: string, operations: readonly DocumentOperation[]): string {
  let current = text;
  for (const operation of operations) {
    if ("d" in operation) {
      expect(current.slice(operation.p, operation.p + operation.d.length)).toBe(operation.d);
      current = current.slice(0, operation.p) + current.slice(operation.p + operation.d.length);
    } else if ("i" in operation) {
      current = current.slice(0, operation.p) + operation.i + current.slice(operation.p);
    }
  }
  return current;
}

const paper = "The sample size is 5000. We report 5000 observations, not 50000.";

describe("buildReplacementOperations", () => {
  it("reports text that is not there", () => {
    expect(buildReplacementOperations(paper, "7000", "8000", false)).toEqual({ status: "not-found" });
  });

  it("refuses an ambiguous match unless every occurrence is wanted", () => {
    expect(buildReplacementOperations(paper, "5000", "8000", false)).toEqual({
      status: "ambiguous",
      occurrenceCount: 3,
    });
  });

  it("refuses an empty findText rather than matching everywhere", () => {
    expect(() => buildReplacementOperations(paper, "", "x", true)).toThrow(/findText is empty/);
  });

  for (const [findText, replaceWith, replaceAll] of [
    ["sample size", "sample", false],
    ["5000", "8000", true],
    ["5000", "", true],
    ["0", "00", true],
    [" not 50000.", "$$x$$", false],
  ] as const) {
    it(`gives the same text as replace_text over Git for "${findText}" → "${replaceWith}"`, () => {
      const built = buildReplacementOperations(paper, findText, replaceWith, replaceAll);
      const expected = replaceTextOccurrences(paper, findText, replaceWith, replaceAll);
      if (built.status !== "replaced" || expected.status !== "replaced") throw new Error("expected a match");
      expect(built.occurrenceCount).toBe(expected.occurrenceCount);
      expect(applyInOrder(paper, built.operations)).toBe(expected.updatedContent);
    });
  }

  it("sends a deletion alone when the replacement is empty", () => {
    const built = buildReplacementOperations("a b c", " b", "", false);
    expect(built).toEqual({ status: "replaced", occurrenceCount: 1, operations: [{ p: 1, d: " b" }] });
  });
});
