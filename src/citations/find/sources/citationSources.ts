import type { ArxivPaperRecord } from "../arxiv/parseArxivPaper.js";
import type { CrossrefWork } from "../crossref/crossrefWorkEntry.js";

/**
 * Where finding a citation reads from, behind an interface so the logic that turns answers
 * into entries can be tested without a network: doi.org for a DOI's BibTeX, the arXiv API for
 * a paper, and a Crossref search for free text.
 */

/** How many works a free-text search offers. */
export const CROSSREF_CANDIDATE_COUNT = 3;

export type DoiBibtexLookup =
  | { readonly outcome: "found"; readonly bibtex: string }
  | { readonly outcome: "not-found"; readonly detail: string }
  | { readonly outcome: "unavailable"; readonly detail: string };

export type ArxivPaperLookup =
  | { readonly outcome: "found"; readonly paper: ArxivPaperRecord }
  | { readonly outcome: "not-found"; readonly detail: string }
  | { readonly outcome: "unavailable"; readonly detail: string };

export type CrossrefWorksSearch =
  /** Best match first. */
  | { readonly outcome: "searched"; readonly works: readonly CrossrefWork[] }
  | { readonly outcome: "unavailable"; readonly detail: string };

export interface CitationSources {
  fetchDoiBibtex(doi: string): Promise<DoiBibtexLookup>;
  fetchArxivPaper(arxivId: string): Promise<ArxivPaperLookup>;
  searchCrossrefWorks(bibliographicQuery: string): Promise<CrossrefWorksSearch>;
}
