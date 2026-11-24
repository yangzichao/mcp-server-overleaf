import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findArxivId, findDoi } from "../../../../../src/citations/citationIdentifiers.js";
import { arxivPaperEntry } from "../../../../../src/citations/find/arxiv/arxivPaperEntry.js";
import type { ArxivPaperRecord } from "../../../../../src/citations/find/arxiv/parseArxivPaper.js";
import { formatBibtexEntry } from "../../../../../src/citations/find/bibtex/bibtexEntry.js";
import { parseBibliographyRecords } from "../../../../../src/citations/parseBibliographyRecords.js";
import { anyReadingRules } from "../../../support/bibliographyArbitraries.js";

const arxivId = fc.oneof(
  fc.stringMatching(/^[0-9]{4}\.[0-9]{4,5}(v[1-9])?$/),
  fc
    .tuple(fc.constantFrom("hep-th", "math.GT", "cond-mat"), fc.stringMatching(/^[0-9]{7}(v[1-9])?$/))
    .map(([archive, number]) => `${archive}/${number}`),
);
const text = fc
  .array(fc.constantFrom("Attention", " ", "Is", "&", "%", "{", "}", "\\", "北京", "𝔸", "Q&A", "$x$"), {
    minLength: 1,
    maxLength: 6,
  })
  .map((pieces) => pieces.join(""));

const paper: fc.Arbitrary<ArxivPaperRecord> = fc.record({
  versionedId: arxivId,
  title: text,
  authorNames: fc.array(fc.constantFrom("Ashish Vaswani", "Łukasz Kaiser", "O'Neil", "Noam Shazeer"), {
    maxLength: 3,
  }),
  published: fc.option(fc.constantFrom("2017-06-12T17:57:34Z", "1997-11-27T21:11:41Z", "", "June 2017"), {
    nil: undefined,
  }),
  primaryCategory: fc.option(fc.constantFrom("cs.CL", "hep-th"), { nil: undefined }),
  doi: fc.option(fc.stringMatching(/^10\.[0-9]{4,6}\/[a-z0-9.]{1,8}$/), { nil: undefined }),
  journalReference: fc.option(text, { nil: undefined }),
});

describe("arxivPaperEntry properties", () => {
  it("writes an entry the citation check reads back as the arXiv id asked for, and the DOI given", () => {
    fc.assert(
      fc.property(paper, arxivId, anyReadingRules, (described, requested, rules) => {
        const entry = arxivPaperEntry(described, requested);
        const [record] = parseBibliographyRecords(
          [{ path: "refs.bib", text: `${formatBibtexEntry({ ...entry, key: "k" })}\n` }],
          rules,
        );
        expect(record && findArxivId(record)).toBe(requested);
        expect(record && findDoi(record)).toBe(described.doi);
      }),
    );
  });

  it("is a @misc entry linking the abstract page, its year the first version's", () => {
    fc.assert(
      fc.property(paper, arxivId, (described, requested) => {
        const entry = arxivPaperEntry(described, requested);
        expect(entry.entryType).toBe("misc");
        expect(entry.fields.get("eprint")).toBe(requested);
        expect(entry.fields.get("archivePrefix")).toBe("arXiv");
        expect(entry.fields.get("url")).toBe(`https://arxiv.org/abs/${requested}`);
        expect(entry.fields.get("year")).toBe(/^\d{4}/.exec(described.published ?? "")?.[0]);
      }),
    );
  });

  it("does not change with the version arXiv answered for, only with the id asked for", () => {
    fc.assert(
      fc.property(paper, arxivId, arxivId, (described, requested, otherVersion) => {
        expect(arxivPaperEntry({ ...described, versionedId: otherVersion }, requested)).toEqual(
          arxivPaperEntry(described, requested),
        );
      }),
    );
  });
});
