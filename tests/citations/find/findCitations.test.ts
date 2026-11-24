import { describe, expect, it } from "vitest";

import type { ArxivPaperRecord } from "../../../src/citations/find/arxiv/parseArxivPaper.js";
import type { CrossrefWork } from "../../../src/citations/find/crossref/crossrefWorkEntry.js";
import {
  type CitationQueryResult,
  findCitations,
  MAXIMUM_CITATION_QUERIES,
  TooManyCitationQueriesError,
} from "../../../src/citations/find/findCitations.js";
import type {
  ArxivPaperLookup,
  CitationSources,
  CrossrefWorksSearch,
  DoiBibtexLookup,
} from "../../../src/citations/find/sources/citationSources.js";
import type { BibliographyRecord } from "../../../src/citations/parseBibliographyRecords.js";

const HE_2016_BIBTEX =
  " @inproceedings{He_2016, title={Deep Residual Learning for Image Recognition}, DOI={10.1109/cvpr.2016.90}, booktitle={CVPR}, author={He, Kaiming and Sun, Jian}, year={2016}, month=June, pages={770–778} }";
const HE_2016_IDENTITY_BIBTEX =
  "@article{He_2016, title={Identity Mappings in Deep Residual Networks}, DOI={10.1007/978-3-319-46493-0_38}, author={He, Kaiming}, year={2016}}";

const ATTENTION: ArxivPaperRecord = {
  versionedId: "1706.03762v7",
  title: "Attention Is All You Need",
  authorNames: ["Ashish Vaswani", "Noam Shazeer"],
  published: "2017-06-12T17:57:34Z",
  primaryCategory: "cs.CL",
  doi: undefined,
  journalReference: undefined,
};

const SEARCH_WORKS: CrossrefWork[] = [
  { DOI: "10.5555/no-title" },
  {
    DOI: "10.1109/cvpr.2016.90",
    type: "proceedings-article",
    title: ["Deep Residual Learning for Image Recognition"],
    author: [{ family: "He", given: "Kaiming" }],
    issued: { "date-parts": [[2016, 6]] },
  },
  {
    DOI: "10.3390/app12188972",
    type: "journal-article",
    title: ["Deep Residual Learning for Image Recognition: A Survey"],
    author: [{ family: "Shafiq", given: "Muhammad" }],
    issued: { "date-parts": [[2022, 9, 7]] },
  },
  {
    DOI: "10.5555/third",
    title: ["Deep residual nets"],
    author: [{ family: "He" }],
    issued: { "date-parts": [[2016]] },
  },
  { DOI: "10.5555/fourth", title: ["A fourth match"] },
];

interface StubAnswers {
  readonly dois?: Record<string, DoiBibtexLookup>;
  readonly arxivPapers?: Record<string, ArxivPaperLookup>;
  readonly searches?: Record<string, CrossrefWorksSearch>;
}

/** Answers from fixed tables and records each call; a query the tables do not hold fails the test. */
function stubSources(answers: StubAnswers): CitationSources & { calls: string[] } {
  const calls: string[] = [];
  function answer<T>(table: Record<string, T> | undefined, name: string, argument: string): Promise<T> {
    calls.push(`${name} ${argument}`);
    const result = table?.[argument];
    return result === undefined
      ? Promise.reject(new Error(`unexpected ${name} ${argument}`))
      : Promise.resolve(result);
  }
  return {
    calls,
    fetchDoiBibtex: (doi) => answer(answers.dois, "doi", doi),
    fetchArxivPaper: (arxivId) => answer(answers.arxivPapers, "arxiv", arxivId),
    searchCrossrefWorks: (text) => answer(answers.searches, "search", text),
  };
}

function record(key: string, fields: Record<string, string>): BibliographyRecord {
  return {
    key,
    entryType: "article",
    location: { path: "refs.bib", line: 1 },
    fields: new Map(Object.entries(fields)),
  };
}

function keysOf(results: CitationQueryResult[]): Array<string | string[]> {
  return results.map((result) => {
    if (result.outcome === "found") return result.citation.key;
    if (result.outcome === "candidates") return result.candidates.map((candidate) => candidate.key);
    return result.outcome;
  });
}

describe("findCitations", () => {
  it("reads a DOI from doi.org, an arXiv id from arXiv, and words from a Crossref search", async () => {
    const sources = stubSources({
      dois: { "10.1109/cvpr.2016.90": { outcome: "found", bibtex: HE_2016_BIBTEX } },
      arxivPapers: { "1706.03762": { outcome: "found", paper: ATTENTION } },
      searches: { "deep residual learning": { outcome: "searched", works: SEARCH_WORKS } },
    });
    const results = await findCitations(
      ["https://doi.org/10.1109/cvpr.2016.90", "arXiv:1706.03762", "  deep residual   learning "],
      sources,
    );

    expect(results[0]).toEqual({
      query: "https://doi.org/10.1109/cvpr.2016.90",
      kind: "doi",
      outcome: "found",
      citation: {
        key: "he2016deep",
        bibtex: [
          "@inproceedings{he2016deep,",
          "  author = {He, Kaiming and Sun, Jian},",
          "  title = {Deep Residual Learning for Image Recognition},",
          "  booktitle = {CVPR},",
          "  pages = {770--778},",
          "  year = {2016},",
          "  month = jun,",
          "  doi = {10.1109/cvpr.2016.90}",
          "}",
        ].join("\n"),
        entryType: "inproceedings",
        title: "Deep Residual Learning for Image Recognition",
        year: "2016",
        doi: "10.1109/cvpr.2016.90",
        arxivId: undefined,
        missingFields: [],
        existingKey: undefined,
      },
    });
    expect(results[1]).toMatchObject({
      kind: "arxiv",
      outcome: "found",
      citation: { key: "vaswani2017attention", arxivId: "1706.03762", entryType: "misc" },
    });
    expect(results[2]).toMatchObject({ kind: "text", outcome: "candidates" });
    // The work without a title is passed over and only three are offered. Offered works share
    // a stem freely, as only one is added, but never take the key of a work found by DOI.
    expect(keysOf(results)).toEqual([
      "he2016deep",
      "vaswani2017attention",
      ["he2016deepb", "shafiq2022deep", "he2016deepb"],
    ]);
    expect(sources.calls).toEqual([
      "doi 10.1109/cvpr.2016.90",
      "arxiv 1706.03762",
      "search deep residual learning",
    ]);
  });

  it("never reuses a key from the bibliography or an earlier result, and points out works already in it", async () => {
    const sources = stubSources({
      dois: {
        "10.1109/cvpr.2016.90": { outcome: "found", bibtex: HE_2016_BIBTEX },
        "10.1007/978-3-319-46493-0_38": { outcome: "found", bibtex: HE_2016_IDENTITY_BIBTEX },
      },
      arxivPapers: { "1706.03762v2": { outcome: "found", paper: ATTENTION } },
    });
    const results = await findCitations(
      ["10.1109/cvpr.2016.90", "10.1007/978-3-319-46493-0_38", "1706.03762v2"],
      sources,
      {
        existingEntries: [
          record("resnet", { doi: "{10.1109/CVPR.2016.90}" }),
          record("transformer", { eprint: "1706.03762v5", archiveprefix: "arXiv" }),
        ],
        takenKeys: ["he2016deep", "HE2016IDENTITY"],
      },
    );
    expect(keysOf(results)).toEqual(["he2016deepb", "he2016identityb", "vaswani2017attention"]);
    expect(results.map((result) => result.outcome === "found" && result.citation.existingKey)).toEqual([
      "resnet",
      undefined,
      "transformer",
    ]);
  });

  it("looks a work named twice up once and gives both queries its key", async () => {
    const sources = stubSources({
      dois: { "10.1109/cvpr.2016.90": { outcome: "found", bibtex: HE_2016_BIBTEX } },
      arxivPapers: { "1706.03762": { outcome: "found", paper: ATTENTION } },
    });
    const results = await findCitations(
      [
        "10.1109/cvpr.2016.90",
        "1706.03762",
        "doi:10.1109/CVPR.2016.90",
        "https://doi.org/10.48550/arXiv.1706.03762",
      ],
      sources,
    );
    expect(keysOf(results)).toEqual([
      "he2016deep",
      "vaswani2017attention",
      "he2016deep",
      "vaswani2017attention",
    ]);
    expect(results[2]?.query).toBe("doi:10.1109/CVPR.2016.90");
    expect(sources.calls).toEqual(["doi 10.1109/cvpr.2016.90", "arxiv 1706.03762"]);
  });

  it("passes on what a service could not answer, and explains a blank query", async () => {
    const sources = stubSources({
      dois: {
        "10.5555/missing": { outcome: "not-found", detail: "doi.org has no such DOI" },
        "10.5555/garbled": { outcome: "found", bibtex: "@article{broken, title = }" },
      },
      arxivPapers: { "2401.00001": { outcome: "unavailable", detail: "arXiv answered 503" } },
      searches: { "nothing usable": { outcome: "searched", works: [{ DOI: "10.5555/untitled" }] } },
    });
    const results = await findCitations(
      ["10.5555/missing", "10.5555/garbled", "2401.00001", "nothing usable", " "],
      sources,
    );
    expect(results.map(({ outcome, ...rest }) => [outcome, "detail" in rest ? rest.detail : ""])).toEqual([
      ["not-found", "doi.org has no such DOI"],
      ["unavailable", "doi.org answered with BibTeX that could not be read"],
      ["unavailable", "arXiv answered 503"],
      ["not-found", "Crossref has no work matching these words"],
      ["not-found", "the query is blank; give a DOI, an arXiv id, or words from the title"],
    ]);
  });

  it("asks Crossref one query at a time, DOIs and searches alike, while arXiv works alongside", async () => {
    let releaseArxiv: () => void = () => undefined;
    const arxivGate = new Promise<void>((resolve) => {
      releaseArxiv = resolve;
    });
    let crossrefRunning = 0;
    let mostCrossrefRunning = 0;
    const calls: string[] = [];
    async function crossrefCall<T>(call: string, answer: T): Promise<T> {
      calls.push(call);
      crossrefRunning += 1;
      mostCrossrefRunning = Math.max(mostCrossrefRunning, crossrefRunning);
      await Promise.resolve();
      crossrefRunning -= 1;
      return answer;
    }
    const sources: CitationSources = {
      fetchDoiBibtex: (doi) => crossrefCall(`doi ${doi}`, { outcome: "not-found", detail: "none" }),
      searchCrossrefWorks: (text) => crossrefCall(`search ${text}`, { outcome: "searched", works: [] }),
      fetchArxivPaper: async (arxivId) => {
        calls.push(`arxiv ${arxivId}`);
        await arxivGate;
        return { outcome: "not-found", detail: "none" };
      },
    };
    const pending = findCitations(
      ["1706.03762", "2005.14165", "10.5555/a", "some words", "10.5555/b"],
      sources,
    );
    await new Promise((resolve) => setImmediate(resolve));
    // Crossref's turn went through all three, in query order, while the first arXiv lookup waits.
    expect(calls).toEqual(["doi 10.5555/a", "arxiv 1706.03762", "search some words", "doi 10.5555/b"]);
    releaseArxiv();
    await pending;
    expect(calls).toContain("arxiv 2005.14165");
    expect(mostCrossrefRunning).toBe(1);
  });

  it("refuses more queries than one call may hold", async () => {
    const queries = Array.from({ length: MAXIMUM_CITATION_QUERIES + 1 }, (_, index) => `query ${index}`);
    await expect(findCitations(queries, stubSources({}))).rejects.toThrow(TooManyCitationQueriesError);
  });
});
