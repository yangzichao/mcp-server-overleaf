import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseBibliographyRecords } from "../../../src/citations/parseBibliographyRecords.js";
import {
  BIBER_READING_RULES,
  BIBTEX_READING_RULES,
  type BibliographyReadingRules,
} from "../../../src/latex/bibliography/bibliographyReadingRules.js";
import {
  anyReadingRules,
  bibliographyPieces,
  type RenderedBibliography,
  renderBibliography,
  type WrittenBibliographyEntry,
} from "../support/bibliographyArbitraries.js";

function expectedRecords(entries: readonly WrittenBibliographyEntry[], rendered: RenderedBibliography) {
  return entries.map((entry, index) => ({
    key: entry.key,
    entryType: entry.entryType.toLowerCase(),
    location: { path: "refs.bib", line: rendered.entryLines[index] },
    fields: new Map(entry.fields.map((field) => [field.name.toLowerCase(), field.expectedValue])),
  }));
}

function keysRead(text: string, rules: BibliographyReadingRules): string[] {
  return parseBibliographyRecords([{ path: "refs.bib", text }], rules).map((record) => record.key);
}

/** Every key but the empty one survives the error, as BibTeX keeps an entry an error cuts short. */
const malformedEntry = fc.constantFrom(
  { written: "@article{broken, title = }", keys: ["broken"] },
  { written: "@article{broken title = {No comma}}", keys: ["broken"] },
  { written: "@misc{, title = {No key}}", keys: [] },
  { written: "@book{broken, = {No name}}", keys: ["broken"] },
);

const COMMENTED_OUT_ENTRY = "% @article{commented, title = {Gone}}";

describe("parseBibliographyRecords properties", () => {
  it("reads back every entry written, with its key, type, line and fields, whichever program reads it", () => {
    fc.assert(
      fc.property(bibliographyPieces, anyReadingRules, (pieces, rules) => {
        const rendered = renderBibliography(pieces);
        const entries = pieces.map(([, entry]) => entry);
        expect(parseBibliographyRecords([{ path: "refs.bib", text: rendered.text }], rules)).toEqual(
          expectedRecords(entries, rendered),
        );
      }),
    );
  });

  it("still reads every well-formed entry when malformed ones sit between them", () => {
    fc.assert(
      fc.property(
        bibliographyPieces,
        fc.array(malformedEntry, { minLength: 1, maxLength: 3 }),
        anyReadingRules,
        (pieces, broken, rules) => {
          const brokenBefore = (index: number) => broken[index % broken.length];
          const withBrokenEntries = pieces.map(
            ([filler, entry], index) => [`${filler}\n${brokenBefore(index)?.written ?? ""}`, entry] as const,
          );
          const rendered = renderBibliography(withBrokenEntries);
          expect(keysRead(rendered.text, rules)).toEqual(
            pieces.flatMap(([, entry], index) => [...(brokenBefore(index)?.keys ?? []), entry.key]),
          );
        },
      ),
    );
  });

  it("reads an entry on a line starting with % for BibTeX, and skips it for biber", () => {
    fc.assert(
      fc.property(bibliographyPieces, fc.nat(), (pieces, chosen) => {
        fc.pre(pieces.length > 0);
        const commentedBefore = chosen % pieces.length;
        const withCommentedEntry = pieces.map(
          ([filler, entry], index) =>
            [index === commentedBefore ? `${filler}\n${COMMENTED_OUT_ENTRY}` : filler, entry] as const,
        );
        const { text } = renderBibliography(withCommentedEntry);
        const keys = pieces.map(([, entry]) => entry.key);
        expect(keysRead(text, BIBER_READING_RULES)).toEqual(keys);
        expect(keysRead(text, BIBTEX_READING_RULES)).toEqual(keys.toSpliced(commentedBefore, 0, "commented"));
      }),
    );
  });

  it("never throws on arbitrary text", () => {
    fc.assert(
      fc.property(fc.string(), anyReadingRules, (text, rules) => {
        expect(Array.isArray(parseBibliographyRecords([{ path: "refs.bib", text }], rules))).toBe(true);
      }),
    );
  });
});
