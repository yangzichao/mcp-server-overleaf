import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseBibliographyRecords } from "../../../src/citations/parseBibliographyRecords.js";
import {
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

const malformedEntry = fc.constantFrom(
  "@article{broken, title = }",
  "@article{broken title = {No comma}}",
  "@misc{, title = {No key}}",
  "@book{broken, = {No name}}",
);

describe("parseBibliographyRecords properties", () => {
  it("reads back every entry written, with its key, type, line and fields", () => {
    fc.assert(
      fc.property(bibliographyPieces, (pieces) => {
        const rendered = renderBibliography(pieces);
        const entries = pieces.map(([, entry]) => entry);
        expect(parseBibliographyRecords("refs.bib", rendered.text)).toEqual(
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
        (pieces, broken) => {
          const withBrokenEntries = pieces.map(([filler, entry], index) => {
            const brokenFiller = broken[index % broken.length] ?? "";
            return [`${filler}\n${brokenFiller}`, entry] as const;
          });
          const rendered = renderBibliography(withBrokenEntries);
          const keys = parseBibliographyRecords("refs.bib", rendered.text).map((record) => record.key);
          expect(keys).toEqual(pieces.map(([, entry]) => entry.key));
        },
      ),
    );
  });

  it("never throws on arbitrary text", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(Array.isArray(parseBibliographyRecords("refs.bib", text))).toBe(true);
      }),
    );
  });
});
