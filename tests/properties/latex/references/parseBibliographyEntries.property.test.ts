import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseBibliographyRecords } from "../../../../src/citations/parseBibliographyRecords.js";
import { parseBibliographyEntries } from "../../../../src/latex/references/parseBibliographyEntries.js";
import { bibliographyPieces, renderBibliography } from "../../support/bibliographyArbitraries.js";

describe("parseBibliographyEntries properties", () => {
  it("finds every entry key written, on the line its entry starts", () => {
    fc.assert(
      fc.property(bibliographyPieces, (pieces) => {
        const rendered = renderBibliography(pieces);
        expect(
          parseBibliographyEntries("refs.bib", rendered.text).map((entry) => [
            entry.key,
            entry.location.line,
          ]),
        ).toEqual(pieces.map(([, entry], index) => [entry.key, rendered.entryLines[index]]));
      }),
    );
  });

  it("agrees with the full record parser on which keys a well-formed file defines", () => {
    fc.assert(
      fc.property(bibliographyPieces, (pieces) => {
        const { text } = renderBibliography(pieces);
        const keysAndTypes = (
          occurrences: ReadonlyArray<{ key: string; command?: string; entryType?: string }>,
        ) => occurrences.map((occurrence) => [occurrence.key, occurrence.command ?? occurrence.entryType]);
        expect(keysAndTypes(parseBibliographyEntries("refs.bib", text))).toEqual(
          keysAndTypes(parseBibliographyRecords("refs.bib", text)),
        );
      }),
    );
  });
});
