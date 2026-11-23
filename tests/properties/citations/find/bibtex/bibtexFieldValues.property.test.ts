import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { markupToLatex, normalizePages } from "../../../../../src/citations/find/bibtex/bibtexFieldValues.js";
import {
  LONG_ENOUGH_TO_EXPOSE_QUADRATIC_TIME,
  millisecondsToRun,
  pumpedText,
} from "../../../support/pumpedText.js";

const PAGE_DASH_REFERENCE = /\s*(?:-{1,3}|[‐-―−])\s*/g;

const DASHES_AND_SPACES = ["-", "--", "---", "–", "—", "−", "‐", " ", "\t", " ", "\n"];

describe("normalizePages properties", () => {
  it("writes page ranges as the reference pattern does", () => {
    const pages = fc
      .array(fc.constantFrom(...DASHES_AND_SPACES, "1", "12", "e5", "x"), { maxLength: 12 })
      .map((pieces) => pieces.join(""));
    fc.assert(
      fc.property(pages, (written) => {
        expect(normalizePages(written)).toBe(written.replace(PAGE_DASH_REFERENCE, "--").trim());
      }),
    );
  });

  it("reads long runs of spaces and dashes at once", () => {
    fc.assert(
      fc.property(pumpedText([...DASHES_AND_SPACES, "1"], LONG_ENOUGH_TO_EXPOSE_QUADRATIC_TIME), (pages) => {
        expect(millisecondsToRun(() => normalizePages(pages))).toBeLessThan(1000);
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});

describe("markupToLatex properties", () => {
  it("reads long runs of tags that never close at once", () => {
    const pieces = ["<", "b", "i", ">", "</", "S", " ", "\u0000"];
    fc.assert(
      fc.property(pumpedText(pieces, LONG_ENOUGH_TO_EXPOSE_QUADRATIC_TIME), (text) => {
        expect(millisecondsToRun(() => markupToLatex(text))).toBeLessThan(1000);
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});
