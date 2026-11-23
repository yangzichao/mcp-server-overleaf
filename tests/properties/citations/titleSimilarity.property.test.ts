import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { normalizeTitleWords, titleSimilarity } from "../../../src/citations/titleSimilarity.js";
import { latexText } from "../support/latexArbitraries.js";
import { decoratedTitle, titleWord } from "./titleWordArbitraries.js";

const anyTitle = fc.oneof(latexText, fc.string({ unit: "grapheme" }));
const titleWords = fc.array(titleWord, { minLength: 1, maxLength: 8 });

describe("titleSimilarity properties", () => {
  it("lies between 0 and 1 and is symmetric", () => {
    fc.assert(
      fc.property(anyTitle, anyTitle, (left, right) => {
        const similarity = titleSimilarity(left, right);
        expect(similarity).toBeGreaterThanOrEqual(0);
        expect(similarity).toBeLessThanOrEqual(1);
        expect(titleSimilarity(right, left)).toBe(similarity);
      }),
    );
  });

  it("is 1 for a title and itself, as long as it has a word", () => {
    fc.assert(
      fc.property(anyTitle, (title) => {
        fc.pre(normalizeTitleWords(title).length > 0);
        expect(titleSimilarity(title, title)).toBe(1);
      }),
    );
  });

  it("ignores LaTeX markup, accents, letter case and punctuation", () => {
    fc.assert(
      fc.property(
        titleWords.chain((words) => fc.tuple(fc.constant(words), decoratedTitle(words))),
        ([words, decorated]) => {
          expect(titleSimilarity(words.join(" "), decorated)).toBe(1);
        },
      ),
    );
  });

  it("still names the same work when a subtitle is left off a title of four or more words", () => {
    fc.assert(
      fc.property(
        fc.array(titleWord, { minLength: 4, maxLength: 8 }),
        fc.array(titleWord, { minLength: 1, maxLength: 6 }),
        (title, subtitle) => {
          const withSubtitle = `${title.join(" ")}: ${subtitle.join(" ")}`;
          expect(titleSimilarity(title.join(" "), withSubtitle)).toBe(1);
        },
      ),
    );
  });

  it("is 0 for titles that share no word", () => {
    fc.assert(
      fc.property(titleWords, titleWords, (left, right) => {
        const leftWords = new Set(left.map((word) => word.toLowerCase()));
        fc.pre(right.every((word) => !leftWords.has(word.toLowerCase())));
        expect(titleSimilarity(left.join(" "), right.join(" "))).toBe(0);
      }),
    );
  });
});

describe("normalizeTitleWords properties", () => {
  it("is idempotent on its own output", () => {
    fc.assert(
      fc.property(anyTitle, (title) => {
        const words = normalizeTitleWords(title);
        expect(normalizeTitleWords(words.join(" "))).toEqual(words);
      }),
    );
  });
});
