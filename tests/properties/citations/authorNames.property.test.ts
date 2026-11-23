import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { listsAuthor } from "../../../src/citations/authorNames.js";
import { decoratedWord, titleWord } from "./titleWordArbitraries.js";

const familyName = fc.stringMatching(/^[A-Z][a-z]{1,9}$/);
const otherAuthors = fc.array(familyName, { maxLength: 4 });

describe("listsAuthor properties", () => {
  it("finds a family name in the list however the .bib file marks it up", () => {
    fc.assert(
      fc.property(
        familyName.chain((family) => fc.tuple(fc.constant(family), decoratedWord(family))),
        otherAuthors,
        otherAuthors,
        ([family, written], before, after) => {
          expect(listsAuthor([...before, family, ...after], written)).toBe(true);
        },
      ),
    );
  });

  it("matches with a particle on one side only", () => {
    fc.assert(
      fc.property(familyName, fc.constantFrom("van der", "de", "von", "van"), (family, particle) => {
        expect(listsAuthor([`${particle} ${family}`], family)).toBe(true);
        expect(listsAuthor([family], `${particle} ${family}`)).toBe(true);
      }),
    );
  });

  it("never matches a family name with no letters or digits", () => {
    fc.assert(
      fc.property(
        fc.array(titleWord, { maxLength: 4 }),
        fc.constantFrom("", " ", "{}", "--", "\\relax", "$ $"),
        (authors, empty) => {
          expect(listsAuthor(authors, empty)).toBe(false);
        },
      ),
    );
  });
});
