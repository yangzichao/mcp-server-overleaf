import { describe, expect, it } from "vitest";

import type {
  IdentifierLookup,
  MetadataServices,
  SearchLookup,
} from "../../src/citations/metadataServices/metadataServices.js";
import type { BibliographyRecord } from "../../src/citations/parseBibliographyRecords.js";
import { verifyBibliographyEntry } from "../../src/citations/verifyBibliographyEntry.js";

function record(fields: Record<string, string>): BibliographyRecord {
  return {
    key: "k",
    entryType: "article",
    location: { path: "refs.bib", line: 1 },
    fields: new Map(Object.entries(fields)),
  };
}

type StubAnswers = Partial<Record<keyof MetadataServices, IdentifierLookup | SearchLookup>>;

/** Answers each service with a fixed result and records the calls; an unanswered service fails the test. */
function services(answers: StubAnswers): MetadataServices & { calls: string[] } {
  const calls: string[] = [];
  function answer<T>(name: keyof MetadataServices, argument: string): Promise<T> {
    const result = answers[name];
    if (result === undefined) return Promise.reject(new Error(`unexpected call to ${name}`));
    calls.push(`${name} ${argument}`);
    return Promise.resolve(result as T);
  }
  return {
    calls,
    lookupDoi: (doi) => answer("lookupDoi", doi),
    lookupArxiv: (arxivId) => answer("lookupArxiv", arxivId),
    searchCrossref: (query) => answer("searchCrossref", query),
  };
}

const TITLE = "Attention is all you need";

describe("verifyBibliographyEntry", () => {
  it("confirms a DOI whose registered title matches", async () => {
    const verdict = await verifyBibliographyEntry(
      record({ title: TITLE, doi: "10.1000/a" }),
      services({ lookupDoi: { outcome: "found", titles: ["Attention Is All You Need"] } }),
    );
    expect(verdict).toEqual({ kind: "confirmed", via: "doi", identifier: "10.1000/a" });
  });

  it("flags a DOI that belongs to a different work", async () => {
    const verdict = await verifyBibliographyEntry(
      record({ title: TITLE, doi: "10.1000/a" }),
      services({ lookupDoi: { outcome: "found", titles: ["Protein folding at scale"] } }),
    );
    expect(verdict).toMatchObject({ kind: "title-mismatch", registeredTitle: "Protein folding at scale" });
  });

  it("flags a DOI that does not exist rather than searching around it", async () => {
    const stub = services({ lookupDoi: { outcome: "not-found", detail: "doi.org has no such DOI" } });
    const verdict = await verifyBibliographyEntry(record({ title: TITLE, doi: "10.1000/missing" }), stub);
    expect(verdict).toMatchObject({ kind: "identifier-not-found", via: "doi" });
    expect(stub.calls).toEqual(["lookupDoi 10.1000/missing"]);
  });

  it("falls back to arXiv, then to a title search, when doi.org cannot be read", async () => {
    const stub = services({
      lookupDoi: { outcome: "unavailable", detail: "doi.org answered 503" },
      lookupArxiv: { outcome: "unavailable", detail: "arXiv answered 503" },
      searchCrossref: { outcome: "searched", candidates: [{ doi: "10.1000/found", titles: [TITLE] }] },
    });
    const verdict = await verifyBibliographyEntry(
      record({
        title: TITLE,
        doi: "10.1000/a",
        eprint: "1706.03762",
        archiveprefix: "arXiv",
        author: "Vaswani, A.",
        year: "{2017}",
      }),
      stub,
    );
    expect(verdict).toEqual({ kind: "confirmed", via: "search", identifier: "10.1000/found" });
    expect(stub.calls.at(-1)).toBe("searchCrossref attention is all you need Vaswani 2017");
  });

  it("reports the closest title when a search finds nothing close", async () => {
    const verdict = await verifyBibliographyEntry(
      record({ title: TITLE }),
      services({
        searchCrossref: {
          outcome: "searched",
          candidates: [{ doi: "10.1/x", titles: ["Attention spans of goldfish"] }],
        },
      }),
    );
    expect(verdict).toEqual({ kind: "no-close-match", closestTitle: "Attention spans of goldfish" });
  });

  it("says why an entry with nothing to look up was not checked", async () => {
    const verdict = await verifyBibliographyEntry(record({ url: "https://example.org" }), services({}));
    expect(verdict).toEqual({ kind: "not-checked", reason: "it has no title, DOI or arXiv id to look up" });
  });
});
