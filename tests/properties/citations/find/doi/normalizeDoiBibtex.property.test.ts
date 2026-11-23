import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type BibtexEntryDraft,
  createBibtexDraft,
  formatBibtexEntry,
} from "../../../../../src/citations/find/bibtex/bibtexEntry.js";
import { normalizeDoiBibtex } from "../../../../../src/citations/find/doi/normalizeDoiBibtex.js";
import { entryType, rawCitationFields } from "../bibtex/rawCitationMetadata.js";

const DOI_LINK_PREFIX = /^https?:\/\/(?:dx\.)?doi\.org\//i;

function decodedLink(link: string): string {
  try {
    return decodeURIComponent(link);
  } catch {
    return link;
  }
}

/** The changes the module documents for an entry already written as here: a url that only links to the DOI goes, and so does an `@inbook` with a booktitle. */
function expectedReadBack(draft: BibtexEntryDraft): BibtexEntryDraft {
  const fields = new Map(draft.fields);
  const doi = fields.get("doi");
  const url = fields.get("url");
  if (doi !== undefined && url !== undefined) {
    if (decodedLink(url).replace(DOI_LINK_PREFIX, "").toLowerCase() === doi.toLowerCase())
      fields.delete("url");
  }
  const type = draft.entryType === "inbook" && fields.has("booktitle") ? "incollection" : draft.entryType;
  return { entryType: type, fields };
}

const doiLink = fc.option(
  fc.constantFrom(
    "https://doi.org/10.1000/xyz",
    "http://dx.doi.org/10.1000/XYZ",
    "https://doi.org/10.1000%2Fxyz",
  ),
  { nil: undefined },
);

const BIBTEX_PIECES = ["@article{", "@misc{,", "}", "{", "=", ",", "doi", " ", "\n", '"', "title", "\\", "%"];

describe("normalizeDoiBibtex properties", () => {
  it("reads back an entry written here as the same entry, less a url that only links to its DOI", () => {
    fc.assert(
      fc.property(
        fc.oneof(entryType, fc.constant("inbook")),
        rawCitationFields,
        doiLink,
        (type, raw, url) => {
          const draft = createBibtexDraft(type, url === undefined ? raw : { ...raw, url });
          const written = formatBibtexEntry({ ...draft, key: "LeCun_2015" });
          expect(normalizeDoiBibtex(written)).toEqual(expectedReadBack(draft));
        },
      ),
    );
  });

  it("never throws, whatever doi.org answers", () => {
    const answer = fc.oneof(
      fc.string(),
      fc.array(fc.constantFrom(...BIBTEX_PIECES), { maxLength: 12 }).map((pieces) => pieces.join("")),
    );
    fc.assert(
      fc.property(answer, (written) => {
        normalizeDoiBibtex(written);
      }),
    );
  });
});
