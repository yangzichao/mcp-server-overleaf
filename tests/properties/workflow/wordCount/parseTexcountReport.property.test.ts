import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseTexcountReport } from "../../../../src/workflow/wordCount/parseTexcountReport.js";
import { millisecondsToRun, pumpedText } from "../../support/pumpedText.js";
import { expectedTexcountReport, renderTexcountOutput, texcountOutput } from "./generatedTexcountOutput.js";

const PROBLEM_LINE_REFERENCE = /^!!!\s*(.*?)\s*!!!\s*$/;

describe("parseTexcountReport properties", () => {
  it("reads back every file, section, total and problem texcount printed", () => {
    fc.assert(
      fc.property(texcountOutput, (output) => {
        expect(parseTexcountReport(renderTexcountOutput(output))).toEqual(expectedTexcountReport(output));
      }),
    );
  });

  it("reads a short problem line as the reference pattern does, when its message holds no line break", () => {
    const line = fc
      .array(fc.constantFrom("!", "!!!", " ", "\t", " ", "　", "x", "é", "𝔸"), { maxLength: 12 })
      .map((pieces) => pieces.join(""));
    fc.assert(
      fc.property(line, (written) => {
        const reference = PROBLEM_LINE_REFERENCE.exec(written);
        expect(parseTexcountReport(written).problems).toEqual(reference ? [reference[1]] : []);
      }),
    );
  });

  it("reads long lines built to make a backtracking pattern slow at once", () => {
    const line = fc
      .tuple(
        fc.constantFrom("!!!", "!!", ""),
        pumpedText(["!!!", " ", "\t", "\u0000", "x", "\r", "1+", ": 2"]),
        fc.constantFrom("!!!", "!!!  ", "", "x", "\n\u0000!!!"),
      )
      .map((parts) => parts.join(""));
    fc.assert(
      fc.property(line, (output) => {
        expect(millisecondsToRun(() => parseTexcountReport(output))).toBeLessThan(1000);
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});
