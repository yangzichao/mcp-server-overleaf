import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findChangedLineRanges } from "../../../../../src/overleaf/realtime/textChanges/changedLineRanges.js";
import { documentLines } from "./editedDocuments.js";

/** The length of the longest common subsequence of lines, by the textbook table. */
function longestCommonSubsequence(oldLines: readonly string[], newLines: readonly string[]): number {
  const row = new Array<number>(newLines.length + 1).fill(0);
  for (const oldLine of oldLines) {
    let diagonal = 0;
    for (let index = 1; index <= newLines.length; index += 1) {
      const above = row[index] ?? 0;
      row[index] = oldLine === newLines[index - 1] ? diagonal + 1 : Math.max(above, row[index - 1] ?? 0);
      diagonal = above;
    }
  }
  return row[newLines.length] ?? 0;
}

describe("findChangedLineRanges properties", () => {
  it("leaves between its ranges, in order, stretches of lines the two texts have in common", () => {
    fc.assert(
      fc.property(documentLines, documentLines, (oldLines, newLines) => {
        let oldIndex = 0;
        let newIndex = 0;
        const ranges = findChangedLineRanges(oldLines, newLines);
        for (const [index, range] of ranges.entries()) {
          expect(range.oldStart - oldIndex).toBe(range.newStart - newIndex);
          if (index > 0) expect(range.oldStart).toBeGreaterThan(oldIndex);
          expect(oldLines.slice(oldIndex, range.oldStart)).toEqual(newLines.slice(newIndex, range.newStart));
          expect(range.oldEnd > range.oldStart || range.newEnd > range.newStart).toBe(true);
          oldIndex = range.oldEnd;
          newIndex = range.newEnd;
        }
        expect(oldLines.slice(oldIndex)).toEqual(newLines.slice(newIndex));
      }),
    );
  });

  it("changes as few lines as any line diff could", () => {
    fc.assert(
      fc.property(documentLines, documentLines, (oldLines, newLines) => {
        const changed = findChangedLineRanges(oldLines, newLines).reduce(
          (total, range) => total + (range.oldEnd - range.oldStart) + (range.newEnd - range.newStart),
          0,
        );
        expect(changed).toBe(
          oldLines.length + newLines.length - 2 * longestCommonSubsequence(oldLines, newLines),
        );
      }),
    );
  });
});
