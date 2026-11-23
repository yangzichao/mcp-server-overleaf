import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseBibliographyRecords } from "../../../../src/citations/parseBibliographyRecords.js";
import { parseBibliographyEntries } from "../../../../src/latex/references/parseBibliographyEntries.js";
import {
  anyReadingRules,
  bibliographyPieces,
  renderBibliography,
} from "../../support/bibliographyArbitraries.js";

describe("parseBibliographyEntries properties", () => {
  it("finds every entry key written, on the line its entry starts, whichever program reads it", () => {
    fc.assert(
      fc.property(bibliographyPieces, anyReadingRules, (pieces, rules) => {
        const rendered = renderBibliography(pieces);
        expect(
          parseBibliographyEntries([{ path: "refs.bib", text: rendered.text }], rules).map((entry) => [
            entry.key,
            entry.location.line,
          ]),
        ).toEqual(pieces.map(([, entry], index) => [entry.key, rendered.entryLines[index]]));
      }),
    );
  });

  it("agrees with the full record parser on the keys and types of any text", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          bibliographyPieces.map((pieces) => renderBibliography(pieces).text),
        ),
        anyReadingRules,
        (text, rules) => {
          const files = [{ path: "refs.bib", text }];
          expect(parseBibliographyEntries(files, rules).map((entry) => [entry.key, entry.command])).toEqual(
            parseBibliographyRecords(files, rules).map((record) => [record.key, record.entryType]),
          );
        },
      ),
    );
  });
});
