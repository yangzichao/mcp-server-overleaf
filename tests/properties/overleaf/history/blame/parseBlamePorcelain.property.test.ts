import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseBlamePorcelain } from "../../../../../src/overleaf/history/blame/parseBlamePorcelain.js";
import { expectedBlameLines, generatedBlame, renderBlamePorcelain } from "./generatedBlamePorcelain.js";

describe("parseBlamePorcelain properties", () => {
  it("reads back each line's commit, number and text from what git printed", () => {
    fc.assert(
      fc.property(generatedBlame, (blame) => {
        expect(parseBlamePorcelain(renderBlamePorcelain(blame))).toEqual(expectedBlameLines(blame));
      }),
    );
  });

  it("reads no line from rows that are not text rows after a header", () => {
    const row = fc.constantFrom(
      "author Ada",
      "summary x",
      "boundary",
      "filename main.tex",
      `${"a".repeat(39)} 1 1 1`,
      `${"a".repeat(40)} 1`,
      `${"A".repeat(40)} 1 1 1`,
      `${"a".repeat(40)} 1 1 1 1`,
      " \ttext",
      "",
    );
    fc.assert(
      fc.property(fc.array(row, { maxLength: 8 }), (rows) => {
        expect(parseBlamePorcelain(rows.join("\n"))).toEqual([]);
      }),
    );
  });
});
