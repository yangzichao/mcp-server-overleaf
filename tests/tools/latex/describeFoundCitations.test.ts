import { describe, expect, it } from "vitest";

import type { CitationQueryResult } from "../../../src/citations/find/findCitations.js";
import type { FoundCitation } from "../../../src/citations/find/foundCitation.js";
import { describeFoundCitations } from "../../../src/tools/latex/citations/describeFoundCitations.js";

function citation(key: string, overrides: Partial<FoundCitation> = {}): FoundCitation {
  return {
    key,
    bibtex: `@misc{${key},\n  title = {A Work}\n}`,
    entryType: "misc",
    title: "A Work",
    year: undefined,
    doi: undefined,
    arxivId: undefined,
    missingFields: [],
    existingKey: undefined,
    ...overrides,
  };
}

describe("describeFoundCitations", () => {
  it("says what each query gave, in the order given, and that nothing was written", () => {
    const results: CitationQueryResult[] = [
      {
        query: "10.5555/a",
        kind: "doi",
        outcome: "found",
        citation: citation("smith2020work", { existingKey: "smith2020", missingFields: ["year"] }),
      },
      { query: "2101.00001", kind: "arxiv", outcome: "not-found", detail: "arXiv has no paper with this id" },
      { query: "some words", kind: "text", outcome: "unavailable", detail: "Crossref did not answer" },
    ];
    expect(describeFoundCitations(results, ["refs.bib", "extra.bib"])).toBe(
      [
        "Looked up 3 queries: 1 found, 0 with matches to choose from, 2 without an entry. Keys avoid those already in refs.bib, extra.bib. Nothing was written to the project; add the entries you choose to a .bib file with edit_file.",
        "",
        '1. "10.5555/a" (DOI): found in doi.org.',
        "@misc{smith2020work,",
        "  title = {A Work}",
        "}",
        "This work is already in the bibliography as smith2020; cite that key rather than adding the entry again.",
        "The source gave no year; fill that in before citing it.",
        "",
        '2. "2101.00001" (arXiv id): not found; arXiv has no paper with this id.',
        "",
        '3. "some words" (words): no answer; Crossref did not answer.',
      ].join("\n"),
    );
  });

  it("numbers the matches a search offered, and says when the project has no .bib file", () => {
    const results: CitationQueryResult[] = [
      {
        query: "deep residual",
        kind: "text",
        outcome: "candidates",
        candidates: [citation("he2016deep"), citation("he2016deepb")],
      },
    ];
    const reply = describeFoundCitations(results, []);
    expect(reply).toContain("Looked up 1 query: 0 found, 1 with matches to choose from, 0 without an entry.");
    expect(reply).toContain("The project has no .bib file yet.");
    expect(reply).toContain(
      '1. "deep residual" (words): 2 matches in Crossref, best first. A search cannot know which work was meant, so compare title, authors and year before adding one.',
    );
    expect(reply).toContain("Match 1:\n@misc{he2016deep,");
    expect(reply).toContain("Match 2:\n@misc{he2016deepb,");
  });
});
