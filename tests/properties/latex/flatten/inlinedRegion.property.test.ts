import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findInlinedRegion, type InlinedRegion } from "../../../../src/latex/flatten/inlinedRegion.js";
import { latexFragment } from "../../support/latexArbitraries.js";

const END_INPUT_LINE = /^[ \t]*\\endinput(?![A-Za-z])/;

const regionLine = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.constantFrom(
      "Some text.",
      "",
      "  ",
      "\\section{A}",
      "x % y",
      "\\endinputs",
      "a \\endinput",
    ),
  },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      "\\endinput",
      "  \\endinput",
      "\t\\endinput  ",
      "\\endinput tail",
      "\\endinput\\relax",
    ),
  },
);
const fileText = fc
  .tuple(fc.array(regionLine, { maxLength: 8 }), fc.constantFrom("\n", "\r\n"))
  .map(([lines, lineBreak]) => lines.join(lineBreak));

/** What TeX reads of an \input file, worked out line by line. */
function expectedRegion(text: string): InlinedRegion {
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const lineEnd = lineStart + line.length;
    const token = END_INPUT_LINE.exec(line);
    if (token) {
      const tokenEnd = lineStart + token[0].length;
      if (text.slice(tokenEnd, lineEnd).trim() === "") {
        return { start: 0, end: lineStart, tailStart: lineEnd, tailEnd: lineEnd };
      }
      return { start: 0, end: tokenEnd - "\\endinput".length, tailStart: tokenEnd, tailEnd: lineEnd };
    }
    lineStart = lineEnd + 1;
  }
  return { start: 0, end: text.length, tailStart: text.length, tailEnd: text.length };
}

const documentBody = fc
  .array(fc.constantFrom("Body text.", "", "  ", "\\section{B}", "$x$"), { maxLength: 5 })
  .map((lines) => lines.join("\n"));
const preamble = fc.constantFrom("", "\\documentclass[main]{subfiles}\n", "\\usepackage{x}\n\n");

const anyMaskedText = fc
  .array(
    fc.oneof(
      latexFragment,
      fc.constantFrom(
        "\n",
        "\r\n",
        " ",
        "\\begin{document}",
        "\\begin {document}",
        "\\end{document}",
        "\\endinput",
      ),
    ),
    { maxLength: 25 },
  )
  .map((pieces) => pieces.join(""));

describe("findInlinedRegion properties", () => {
  it("gives ordered indices inside the text, for any text, as a subfile or not", () => {
    fc.assert(
      fc.property(anyMaskedText, fc.boolean(), (text, isSubfile) => {
        const region = findInlinedRegion(text, isSubfile);
        expect(0).toBeLessThanOrEqual(region.start);
        expect(region.start).toBeLessThanOrEqual(region.end);
        expect(region.end).toBeLessThanOrEqual(region.tailStart);
        expect(region.tailStart).toBeLessThanOrEqual(region.tailEnd);
        expect(region.tailEnd).toBeLessThanOrEqual(text.length);
      }),
    );
  });

  it("reads an \\input file up to its first \\endinput line, keeping the rest of that line", () => {
    fc.assert(
      fc.property(fileText, (text) => {
        expect(findInlinedRegion(text, false)).toEqual(expectedRegion(text));
      }),
    );
  });

  it("reads a subfile's document body, without the blank ends of the \\begin and \\end lines", () => {
    fc.assert(
      fc.property(preamble, documentBody, fc.constantFrom("", "\n", "\nafter"), (before, body, after) => {
        const text = `${before}\\begin{document}\n${body}\n\\end{document}${after}`;
        const region = findInlinedRegion(text, true);
        const expected = body.trim() === "" ? "" : `${body}\n`;
        expect(text.slice(region.start, region.end)).toBe(expected);
        expect(region.tailStart).toBe(region.end);
        expect(region.tailEnd).toBe(region.end);
      }),
    );
  });
});
