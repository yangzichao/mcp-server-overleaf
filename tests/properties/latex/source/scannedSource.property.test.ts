import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { scanSource } from "../../../../src/latex/source/scannedSource.js";
import { latexTextWithLineBreaksAnywhere } from "../../support/latexArbitraries.js";

function countNewlinesBefore(text: string, index: number): number {
  return [...text.slice(0, index)].filter((character) => character === "\n").length;
}

describe("scanSource properties", () => {
  it("puts every index on the line a naive newline count gives", () => {
    fc.assert(
      fc.property(
        latexTextWithLineBreaksAnywhere.chain((text) => fc.tuple(fc.constant(text), fc.nat(text.length))),
        ([text, index]) => {
          expect(scanSource("main.tex", text).lineAt(index)).toBe(countNewlinesBefore(text, index) + 1);
        },
      ),
    );
  });
});
