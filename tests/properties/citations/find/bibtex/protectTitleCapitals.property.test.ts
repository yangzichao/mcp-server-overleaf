import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { protectTitleCapitals } from "../../../../../src/citations/find/bibtex/protectTitleCapitals.js";
import {
  LONG_ENOUGH_TO_EXPOSE_QUADRATIC_TIME,
  millisecondsToRun,
  pumpedText,
} from "../../../support/pumpedText.js";

const titleWord = fc.constantFrom(
  "BERT",
  "ImageNet",
  "Self-Attention",
  "GPT-4",
  "t-SNE",
  "3D",
  "of",
  "{The",
  "Challenge}",
  "\\textit{E.",
  "$O(N$",
  "\\log",
  "N)$",
  "(LSTM)",
  "»ÉCOLE«",
  "é",
  "",
  "}",
  "{",
);
const title = fc.oneof(
  fc.array(titleWord, { maxLength: 8 }).map((words) => words.join(" ")),
  fc.string({ unit: "grapheme" }),
);

function withoutBraces(text: string): string {
  return text.replace(/[{}]/g, "");
}

const coreWithInnerCapital = fc
  .tuple(
    fc.array(fc.constantFrom("of", "Self", "4", "x"), { maxLength: 2 }),
    fc.constantFrom("BERT", "ImageNet", "3D", "SNE", "ÉA", "eBay", "x𝔸B"),
    fc.array(fc.constantFrom("of", "Self", "4", "x"), { maxLength: 2 }),
    fc.constantFrom("-", "/"),
  )
  .map(([before, inner, after, separator]) => [...before, inner, ...after].join(separator));
const punctuation = fc
  .array(fc.constantFrom("(", ")", ",", ".", ":", "'", '"', "?", "«", "»", "—", "\u0000"), { maxLength: 3 })
  .map((marks) => marks.join(""));

describe("protectTitleCapitals properties", () => {
  it("adds nothing but braces", () => {
    fc.assert(
      fc.property(title, (written) => {
        expect(withoutBraces(protectTitleCapitals(written))).toBe(withoutBraces(written));
      }),
    );
  });

  it("leaves a title it already protected as it is", () => {
    fc.assert(
      fc.property(title, (written) => {
        const protectedOnce = protectTitleCapitals(written);
        expect(protectTitleCapitals(protectedOnce)).toBe(protectedOnce);
      }),
    );
  });

  it("braces a word with an inner capital from its first letter or digit to its last", () => {
    fc.assert(
      fc.property(punctuation, coreWithInnerCapital, punctuation, (leading, core, trailing) => {
        expect(protectTitleCapitals(`a ${leading}${core}${trailing}`)).toBe(
          `a ${leading}{${core}}${trailing}`,
        );
      }),
    );
  });

  it("reads words with long runs of punctuation inside at once", () => {
    const word = pumpedText(["\u0000", ".", "0", "a", "A", "-", "B"], LONG_ENOUGH_TO_EXPOSE_QUADRATIC_TIME);
    fc.assert(
      fc.property(word, (written) => {
        expect(millisecondsToRun(() => protectTitleCapitals(`a ${written}`))).toBeLessThan(1000);
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});
