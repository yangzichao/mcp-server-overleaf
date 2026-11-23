import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createBibtexDraft } from "../../../../../src/citations/find/bibtex/bibtexEntry.js";
import { asciiWords, citationKeyStem } from "../../../../../src/citations/find/keys/citationKeyStem.js";
import { rawCitationFields } from "../bibtex/rawCitationMetadata.js";
import { personName, writtenInOrder, writtenLastFirst } from "./writtenPersonNames.js";

function stemForAuthor(author: string): string {
  return citationKeyStem(createBibtexDraft("article", { author }));
}

const coAuthors = fc.constantFrom("", " and Other, A.", " and others", " and {World Health Organization}");

describe("citationKeyStem properties", () => {
  it("makes a stem of lower-case ASCII letters and digits that is never empty", () => {
    fc.assert(
      fc.property(rawCitationFields, (raw) => {
        expect(citationKeyStem(createBibtexDraft("article", raw))).toMatch(/^[a-z0-9]+$/);
      }),
    );
  });

  it("reads the first author's family name as BibTeX's Last part, in either order", () => {
    fc.assert(
      fc.property(personName, coAuthors, (name, others) => {
        const familyName = asciiWords(name.last.join(" ")).join("");
        expect(stemForAuthor(`${writtenInOrder(name)}${others}`)).toBe(familyName);
        if (name.first.length > 0)
          expect(stemForAuthor(`${writtenLastFirst(name)}${others}`)).toBe(familyName);
      }),
    );
  });
});
