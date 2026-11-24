import { describe, expect, it } from "vitest";

import type { CitedBibliography } from "../../../src/citations/collectCitedRecords.js";
import type { CitationSources } from "../../../src/citations/find/sources/citationSources.js";
import type { BibliographyRecord } from "../../../src/citations/parseBibliographyRecords.js";
import { DEFAULT_CITATION_LOOKUP_ENDPOINTS } from "../../../src/config/citationLookupConfiguration.js";
import {
  CITATION_LOOKUP_BUDGET_MS,
  type CitationLookupDeadline,
  startCitationLookupDeadline,
  stopLookupsAtDeadline,
} from "../../../src/tools/latex/citations/citationLookupDeadline.js";
import { verifyCitedEntries } from "../../../src/tools/latex/citations/verifyCitedEntries.js";

/** A deadline that has not passed for the first `checksBeforeDeadline` checks, then has. */
function deadlineAfterChecks(checksBeforeDeadline: number): CitationLookupDeadline {
  let checks = 0;
  return {
    budgetSeconds: CITATION_LOOKUP_BUDGET_MS / 1000,
    hasPassed: () => {
      checks += 1;
      return checks > checksBeforeDeadline;
    },
  };
}

/** Sources that record each call; a DOI or arXiv id is not found, and a search finds nothing. */
function recordingSources(): CitationSources & { calls: string[] } {
  const calls: string[] = [];
  const notFound = { outcome: "not-found", detail: "no such work" } as const;
  return {
    calls,
    fetchDoiBibtex: (doi) => {
      calls.push(`doi ${doi}`);
      return Promise.resolve(notFound);
    },
    fetchArxivPaper: (arxivId) => {
      calls.push(`arxiv ${arxivId}`);
      return Promise.resolve(notFound);
    },
    searchCrossrefWorks: (text) => {
      calls.push(`search ${text}`);
      return Promise.resolve({ outcome: "searched", works: [] });
    },
  };
}

/** An entry with no title, DOI or arXiv id, which verify reports without contacting anything. */
function entryWithoutIdentifiers(key: string, line: number): BibliographyRecord {
  return { key, entryType: "misc", location: { path: "refs.bib", line }, fields: new Map() };
}

describe("startCitationLookupDeadline", () => {
  it("passes once the budget has run from the start of the call", () => {
    let now = 1_000;
    const deadline = startCitationLookupDeadline(() => now);
    expect(deadline.budgetSeconds).toBe(45);
    now += CITATION_LOOKUP_BUDGET_MS - 1;
    expect(deadline.hasPassed()).toBe(false);
    now += 1;
    expect(deadline.hasPassed()).toBe(true);
  });
});

describe("stopLookupsAtDeadline", () => {
  it("passes lookups through before the deadline and answers without a request after it", async () => {
    const sources = recordingSources();
    const guarded = stopLookupsAtDeadline(sources, deadlineAfterChecks(1));
    expect(await guarded.fetchDoiBibtex("10.5555/a")).toEqual({
      outcome: "not-found",
      detail: "no such work",
    });
    expect(await guarded.fetchArxivPaper("1706.03762")).toEqual({
      outcome: "unavailable",
      detail:
        "not looked up, because this call stopped starting lookups after 45 seconds; ask again with this query",
    });
    expect(await guarded.searchCrossrefWorks("attention")).toMatchObject({ outcome: "unavailable" });
    expect(sources.calls).toEqual(["doi 10.5555/a"]);
  });
});

describe("verifyCitedEntries at the deadline", () => {
  const records = [
    entryWithoutIdentifiers("first", 1),
    entryWithoutIdentifiers("second", 2),
    entryWithoutIdentifiers("third", 3),
  ];
  const bibliography: CitedBibliography = {
    bibliographyFiles: ["refs.bib"],
    records,
    allRecords: records,
    keysWithoutEntries: [],
    citesEveryEntry: false,
  };

  it("stops starting entries once the deadline passes and names the keys it did not reach", async () => {
    const reply = await verifyCitedEntries({
      bibliography,
      rootPath: "main.tex",
      keys: undefined,
      maximumEntries: 2,
      endpoints: DEFAULT_CITATION_LOOKUP_ENDPOINTS,
      deadline: deadlineAfterChecks(1),
    });
    expect(reply).toContain("Looked up 1 entry from refs.bib: no entry points at the wrong work.");
    expect(reply).toContain(
      "first (refs.bib:1): not checked, because it has no title, DOI or arXiv id to look up.",
    );
    expect(reply).toContain(
      "This call stopped starting lookups after 45 seconds, so 1 entry was not looked up: second. Pass them as keys in another call to check them.",
    );
    expect(reply).toContain(
      "1 more entry was not looked up; pass keys, or a larger maximumEntries, to check them.",
    );
  });

  it("says nothing about the deadline when every entry was reached", async () => {
    const reply = await verifyCitedEntries({
      bibliography,
      rootPath: "main.tex",
      keys: undefined,
      maximumEntries: 30,
      endpoints: DEFAULT_CITATION_LOOKUP_ENDPOINTS,
      deadline: deadlineAfterChecks(Number.POSITIVE_INFINITY),
    });
    expect(reply).toContain("Looked up 3 entries from refs.bib");
    expect(reply).not.toContain("stopped starting lookups");
  });
});
