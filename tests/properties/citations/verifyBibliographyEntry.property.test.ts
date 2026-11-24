import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { listsAuthor } from "../../../src/citations/authorNames.js";
import {
  findArxivId,
  findDoi,
  findFirstAuthorFamilyName,
} from "../../../src/citations/citationIdentifiers.js";
import type {
  IdentifierLookup,
  MetadataServices,
  SearchCandidate,
  SearchLookup,
} from "../../../src/citations/metadataServices/metadataServices.js";
import type { BibliographyRecord } from "../../../src/citations/parseBibliographyRecords.js";
import { SAME_WORK_THRESHOLD, titleSimilarity } from "../../../src/citations/titleSimilarity.js";
import { verifyBibliographyEntry } from "../../../src/citations/verifyBibliographyEntry.js";

const TITLES = [
  "Attention Is All You Need",
  "Attention is all you need!",
  "Protein folding at scale",
  "{BERT}: Pre-training",
  "",
];
const title = fc.constantFrom(...TITLES);

const record: fc.Arbitrary<BibliographyRecord> = fc
  .record(
    {
      title,
      doi: fc.constantFrom("10.1000/a", "https://doi.org/10.1000/b", "not a doi", ""),
      url: fc.constantFrom(
        "https://arxiv.org/abs/1706.03762",
        "https://doi.org/10.5555/c",
        "https://example.org",
      ),
      eprint: fc.constantFrom("1706.03762v5", "hep-th/9901001", "junk"),
      archiveprefix: fc.constantFrom("arXiv", "other"),
      author: fc.constantFrom(
        "Vaswani, Ashish and others",
        "Ashish Vaswani",
        "{World Health Organization}",
        "others",
        "",
      ),
      year: fc.constantFrom("2017", "{2017}"),
    },
    { requiredKeys: [] },
  )
  .map((fields) => ({
    key: "k",
    entryType: "misc",
    location: { path: "refs.bib", line: 1 },
    fields: new Map(Object.entries(fields)),
  }));

const identifierLookup: fc.Arbitrary<IdentifierLookup> = fc.oneof(
  fc.record({ outcome: fc.constant("found" as const), titles: fc.array(title, { maxLength: 2 }) }),
  fc.record({ outcome: fc.constant("not-found" as const), detail: fc.constant("no such work") }),
  fc.record({
    outcome: fc.constant("unavailable" as const),
    detail: fc.constantFrom("timed out", "HTTP 503"),
  }),
);
const searchCandidate: fc.Arbitrary<SearchCandidate> = fc.record({
  doi: fc.constantFrom("10.1/x", "10.1/y", "10.1/z"),
  titles: fc.array(title, { minLength: 1, maxLength: 2 }),
  authorNames: fc.array(fc.constantFrom("Vaswani", "Smith", "World Health Organization"), { maxLength: 2 }),
  year: fc.option(fc.constantFrom(2017, 2023), { nil: undefined }),
});
const searchLookup: fc.Arbitrary<SearchLookup> = fc.oneof(
  fc.record({
    outcome: fc.constant("searched" as const),
    candidates: fc.array(searchCandidate, { maxLength: 3 }),
  }),
  fc.record({ outcome: fc.constant("unavailable" as const), detail: fc.constant("HTTP 429") }),
);
const answers = fc.record({ doi: identifierLookup, arxiv: identifierLookup, search: searchLookup });

function answeringServices(given: { doi: IdentifierLookup; arxiv: IdentifierLookup; search: SearchLookup }) {
  const calls: string[] = [];
  const services: MetadataServices = {
    lookupDoi: (doi) => {
      calls.push(`doi ${doi}`);
      return Promise.resolve(given.doi);
    },
    lookupArxiv: (arxivId) => {
      calls.push(`arxiv ${arxivId}`);
      return Promise.resolve(given.arxiv);
    },
    searchCrossref: (query) => {
      calls.push(`search ${query}`);
      return Promise.resolve(given.search);
    },
  };
  return { services, calls };
}

function settles(lookup: IdentifierLookup): boolean {
  return lookup.outcome !== "unavailable";
}

/** The lookups, in order, an entry should make before a title search, and whether it searches at all. */
function expectedLookups(
  entry: BibliographyRecord,
  given: { doi: IdentifierLookup; arxiv: IdentifierLookup },
) {
  const doi = findDoi(entry);
  const arxivId = findArxivId(entry);
  const settledByDoi = Boolean(doi) && settles(given.doi);
  const settledByArxiv = !settledByDoi && Boolean(arxivId) && settles(given.arxiv);
  const lookups = [...(doi ? [`doi ${doi}`] : []), ...(!settledByDoi && arxivId ? [`arxiv ${arxivId}`] : [])];
  return { lookups, searches: !settledByDoi && !settledByArxiv && Boolean(entry.fields.get("title")) };
}

describe("verifyBibliographyEntry properties", () => {
  it("asks for the DOI, then the arXiv id, then a title search, stopping at the first that settles it", async () => {
    await fc.assert(
      fc.asyncProperty(record, answers, async (entry, given) => {
        const { services, calls } = answeringServices(given);
        await verifyBibliographyEntry(entry, services);
        const { lookups, searches } = expectedLookups(entry, given);
        expect(calls.slice(0, lookups.length)).toEqual(lookups);
        expect(calls).toHaveLength(lookups.length + (searches ? 1 : 0));
        if (searches) expect(calls.at(-1)).toMatch(/^search /);
      }),
    );
  });

  it("confirms an entry by a title search only through a close title that lists the first author", async () => {
    await fc.assert(
      fc.asyncProperty(record, answers, async (entry, given) => {
        const verdict = await verifyBibliographyEntry(entry, answeringServices(given).services);
        if (verdict.kind !== "confirmed" || verdict.via !== "search") return;
        const entryTitle = entry.fields.get("title") ?? "";
        const familyName = findFirstAuthorFamilyName(entry);
        const candidates = given.search.outcome === "searched" ? given.search.candidates : [];
        expect(
          candidates.some(
            (candidate) =>
              candidate.doi === verdict.identifier &&
              candidate.titles.some(
                (candidateTitle) => titleSimilarity(entryTitle, candidateTitle) >= SAME_WORK_THRESHOLD,
              ) &&
              (familyName === undefined || listsAuthor(candidate.authorNames, familyName)),
          ),
        ).toBe(true);
      }),
    );
  });

  it("reports an identifier that does not resolve as not found, under the identifier it looked up", async () => {
    await fc.assert(
      fc.asyncProperty(record, answers, async (entry, given) => {
        const verdict = await verifyBibliographyEntry(entry, answeringServices(given).services);
        const doi = findDoi(entry);
        if (doi && given.doi.outcome === "not-found") {
          expect(verdict).toEqual({
            kind: "identifier-not-found",
            via: "doi",
            identifier: doi,
            detail: "no such work",
          });
        }
        if (verdict.kind === "title-mismatch") {
          const lookup = verdict.via === "doi" ? given.doi : given.arxiv;
          expect(lookup.outcome === "found" && lookup.titles[0]).toBe(verdict.registeredTitle);
        }
      }),
    );
  });
});
