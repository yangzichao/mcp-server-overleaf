import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { collectLatexDiagnostics } from "../../../src/latex/collectLatexDiagnostics.js";
import { latexLine } from "../support/latexArbitraries.js";

const logLine = fc.oneof(
  latexLine,
  fc.constantFrom(
    "! Undefined control sequence.",
    "main.tex:12: Undefined control sequence",
    "  ! Indented error",
    "LaTeX Warning: Reference `x' on page 1 undefined.",
    "Package natbib Warning: Citation `y' undefined.",
    "Overfull \\hbox (1.0pt too wide)",
    "Underfull \\vbox",
    "Warning--empty journal in smith2020",
    "I couldn't open database file refs.bib",
    "[12] Utils.pm:123> ERROR - missing file",
    "WARN - duplicate entry",
    "",
  ),
);
const compilerOutput = fc.array(logLine, { maxLength: 120 }).map((lines) => lines.join("\n"));

function isSubsequence(subsequence: readonly string[], sequence: readonly string[]): boolean {
  let cursor = 0;
  for (const item of sequence) if (cursor < subsequence.length && subsequence[cursor] === item) cursor += 1;
  return cursor === subsequence.length;
}

describe("collectLatexDiagnostics properties", () => {
  it("reports at most 40 of each, trimmed, in the order the log has them", () => {
    fc.assert(
      fc.property(compilerOutput, (output) => {
        const trimmedLines = output.split("\n").map((line) => line.trim());
        const { errorLines, warningLines } = collectLatexDiagnostics(output);
        for (const reported of [errorLines, warningLines]) {
          expect(reported.length).toBeLessThanOrEqual(40);
          expect(isSubsequence(reported, trimmedLines)).toBe(true);
        }
      }),
    );
  });

  it("reports every `! ` error up to the cap, however much else the log holds", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(latexLine, fc.boolean()), { maxLength: 60 }), (lines) => {
        const output = lines
          .map(([line, isError]) => (isError ? `! Error ${line}` : `ok ${line.replace(/[^a-z ]/g, "")}`))
          .join("\n");
        const errorCount = lines.filter(([, isError]) => isError).length;
        expect(collectLatexDiagnostics(output).errorLines).toHaveLength(Math.min(errorCount, 40));
      }),
    );
  });
});
