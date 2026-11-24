import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  findArxivId,
  findDoi,
  findFirstAuthorFamilyName,
} from "../../../src/citations/citationIdentifiers.js";
import type { BibliographyRecord } from "../../../src/citations/parseBibliographyRecords.js";

function recordWith(fields: Record<string, string>): BibliographyRecord {
  return {
    key: "entry",
    entryType: "article",
    location: { path: "refs.bib", line: 1 },
    fields: new Map(Object.entries(fields)),
  };
}

const doi = fc
  .tuple(fc.stringMatching(/^[0-9]{4,9}$/), fc.stringMatching(/^[A-Za-z0-9._;()/:<>-]{1,20}$/))
  .map(([registrant, suffix]) => `10.${registrant}/${suffix}`);
const doiSpelling = fc.constantFrom(
  (written: string) => written,
  (written: string) => `doi:${written}`,
  (written: string) => `DOI: ${written}`,
  (written: string) => `https://doi.org/${written}`,
  (written: string) => `http://dx.doi.org/${written}`,
  (written: string) => `{${written}}`,
);

const newArxivId = fc
  .tuple(
    fc.stringMatching(/^[0-9]{4}$/),
    fc.stringMatching(/^[0-9]{4,5}$/),
    fc.option(fc.nat(9), { nil: undefined }),
  )
  .map(([month, number, version]) => `${month}.${number}${version === undefined ? "" : `v${version}`}`);
const oldArxivId = fc
  .tuple(
    fc.constantFrom("hep-th", "math", "cond-mat", "cs"),
    fc.option(fc.constantFrom(".GT", ".CL", ".AI"), { nil: "" }),
    fc.stringMatching(/^[0-9]{7}$/),
  )
  .map(([archive, subject, number]) => `${archive}${subject}/${number}`);
const arxivId = fc.oneof(newArxivId, oldArxivId);
const arxivPlacement = fc.constantFrom(
  (id: string) => ({ archiveprefix: "arXiv", eprint: id }),
  (id: string) => ({ eprinttype: "arxiv", eprint: `arXiv:${id}` }),
  (id: string) => ({ url: `https://arxiv.org/abs/${id}` }),
  (id: string) => ({ url: `https://arxiv.org/pdf/${id}.pdf` }),
  (id: string) => ({ journal: `arXiv preprint arXiv:${id}` }),
  (id: string) => ({ note: `arXiv: ${id}` }),
);

const nameWord = fc
  .stringMatching(/^[A-Z][a-z]{1,9}$/)
  .filter((word) => !["and", "others"].includes(word.toLowerCase()));
const authorField = fc
  .record({
    family: nameWord,
    given: fc.array(nameWord, { minLength: 1, maxLength: 2 }),
    familyFirst: fc.boolean(),
    braced: fc.boolean(),
    coauthors: fc.array(nameWord, { maxLength: 3 }),
    separator: fc.constantFrom(" and ", " AND ", "\nand "),
  })
  .map((author) => {
    const family = author.braced ? `{${author.family}}` : author.family;
    const first = author.familyFirst
      ? `${family}, ${author.given.join(" ")}`
      : `${author.given.join(" ")} ${family}`;
    return { family: author.family, written: [first, ...author.coauthors].join(author.separator) };
  });

describe("findDoi properties", () => {
  it("finds a DOI in the doi field in any common spelling", () => {
    fc.assert(
      fc.property(doi, doiSpelling, (written, spell) => {
        expect(findDoi(recordWith({ doi: spell(written) }))).toBe(written);
      }),
    );
  });

  it("finds a DOI in a doi.org URL when the doi field is missing", () => {
    fc.assert(
      fc.property(
        doi,
        fc.constantFrom("https://doi.org/", "http://dx.doi.org/", "HTTPS://DOI.ORG/"),
        (written, prefix) => {
          expect(findDoi(recordWith({ url: `${prefix}${written}` }))).toBe(written);
        },
      ),
    );
  });

  it("only ever returns a string shaped like a DOI", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (doiField, urlField) => {
        const found = findDoi(recordWith({ doi: doiField, url: urlField }));
        if (found !== undefined) expect(found).toMatch(/^10\.\d{4,9}\/\S+$/);
      }),
    );
  });
});

describe("findArxivId properties", () => {
  it("finds an arXiv id in eprint, a URL, or the journal or note field", () => {
    fc.assert(
      fc.property(arxivId, arxivPlacement, (id, place) => {
        expect(findArxivId(recordWith(place(id)))).toBe(id);
      }),
    );
  });
});

describe("findFirstAuthorFamilyName properties", () => {
  it("takes the first author's family name in either name order, braced or not", () => {
    fc.assert(
      fc.property(authorField, ({ family, written }) => {
        expect(findFirstAuthorFamilyName(recordWith({ author: written }))).toBe(family);
      }),
    );
  });
});
