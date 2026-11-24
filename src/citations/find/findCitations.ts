import type { BibliographyRecord } from "../parseBibliographyRecords.js";
import { arxivPaperEntry } from "./arxiv/arxivPaperEntry.js";
import type { BibtexEntryDraft } from "./bibtex/bibtexEntry.js";
import { type ClassifiedCitationQuery, classifyCitationQuery } from "./classifyCitationQuery.js";
import { crossrefWorkEntry } from "./crossref/crossrefWorkEntry.js";
import { normalizeDoiBibtex } from "./doi/normalizeDoiBibtex.js";
import { CitationWriter, type FoundCitation } from "./foundCitation.js";
import { type CitationSources, CROSSREF_CANDIDATE_COUNT } from "./sources/citationSources.js";

/**
 * BibTeX for works named by DOI, by arXiv id or by a few words: a DOI is read from doi.org, an
 * arXiv id from arXiv, and words are searched for in Crossref, which offers its best matches.
 * A work named twice is looked up once and given one key.
 *
 * Queries go out one at a time to Crossref and one at a time to arXiv, the two side by side.
 * DOIs share Crossref's turn with searches because doi.org hands Crossref DOIs to Crossref,
 * which answers 429 to a second request made while one is running.
 */

export const MAXIMUM_CITATION_QUERIES = 20;

export class TooManyCitationQueriesError extends Error {}

export type CitationQueryKind = ClassifiedCitationQuery["kind"];

export type CitationQueryResult =
  | {
      readonly query: string;
      readonly kind: CitationQueryKind;
      readonly outcome: "found";
      readonly citation: FoundCitation;
    }
  | {
      readonly query: string;
      readonly kind: CitationQueryKind;
      /** Best match first; a search cannot know which one was meant. */
      readonly outcome: "candidates";
      readonly candidates: readonly FoundCitation[];
    }
  | {
      readonly query: string;
      readonly kind: CitationQueryKind;
      readonly outcome: "not-found" | "unavailable";
      readonly detail: string;
    };

export interface FindCitationsOptions {
  /** The project's bibliography: its keys are not reused, and a work already in it is pointed out. */
  readonly existingEntries?: readonly BibliographyRecord[];
  /** Further keys not to reuse. */
  readonly takenKeys?: Iterable<string>;
}

/** What a query resolved to, before keys are chosen. */
type Resolution =
  | { readonly outcome: "found"; readonly draft: BibtexEntryDraft }
  | { readonly outcome: "candidates"; readonly drafts: readonly BibtexEntryDraft[] }
  | { readonly outcome: "not-found" | "unavailable"; readonly detail: string };

async function resolveDoi(sources: CitationSources, doi: string): Promise<Resolution> {
  const lookup = await sources.fetchDoiBibtex(doi);
  if (lookup.outcome !== "found") return lookup;
  const draft = normalizeDoiBibtex(lookup.bibtex);
  if (draft) return { outcome: "found", draft };
  return { outcome: "unavailable", detail: "doi.org answered with BibTeX that could not be read" };
}

async function resolveArxivId(sources: CitationSources, arxivId: string): Promise<Resolution> {
  const lookup = await sources.fetchArxivPaper(arxivId);
  if (lookup.outcome !== "found") return lookup;
  return { outcome: "found", draft: arxivPaperEntry(lookup.paper, arxivId) };
}

async function resolveWords(sources: CitationSources, words: string): Promise<Resolution> {
  const search = await sources.searchCrossrefWorks(words);
  if (search.outcome !== "searched") return search;
  const drafts = search.works
    .flatMap((work) => crossrefWorkEntry(work) ?? [])
    .slice(0, CROSSREF_CANDIDATE_COUNT);
  if (drafts.length > 0) return { outcome: "candidates", drafts };
  return { outcome: "not-found", detail: "Crossref has no work matching these words" };
}

interface PendingLookup {
  readonly index: number;
  /** Queries naming the same work share one lookup. */
  readonly identity: string;
  readonly resolve: () => Promise<Resolution>;
}

function pendingLookup(
  sources: CitationSources,
  query: ClassifiedCitationQuery,
  index: number,
): PendingLookup {
  if (query.kind === "doi") {
    return {
      index,
      identity: `doi ${query.doi.toLowerCase()}`,
      resolve: () => resolveDoi(sources, query.doi),
    };
  }
  if (query.kind === "arxiv") {
    return {
      index,
      identity: `arxiv ${query.arxivId.toLowerCase()}`,
      resolve: () => resolveArxivId(sources, query.arxivId),
    };
  }
  return {
    index,
    identity: `text ${query.text.toLowerCase()}`,
    resolve: () => resolveWords(sources, query.text),
  };
}

async function resolveOneAtATime(
  lookups: readonly PendingLookup[],
  resolutions: Resolution[],
): Promise<void> {
  const byIdentity = new Map<string, Resolution>();
  for (const lookup of lookups) {
    const resolution = byIdentity.get(lookup.identity) ?? (await lookup.resolve());
    byIdentity.set(lookup.identity, resolution);
    resolutions[lookup.index] = resolution;
  }
}

const BLANK_QUERY: Resolution = {
  outcome: "not-found",
  detail: "the query is blank; give a DOI, an arXiv id, or words from the title",
};

async function resolveAll(
  sources: CitationSources,
  queries: readonly ClassifiedCitationQuery[],
): Promise<Resolution[]> {
  const resolutions: Resolution[] = queries.map(() => BLANK_QUERY);
  const crossrefLookups: PendingLookup[] = [];
  const arxivLookups: PendingLookup[] = [];
  for (const [index, query] of queries.entries()) {
    if (query.kind === "text" && query.text === "") continue;
    (query.kind === "arxiv" ? arxivLookups : crossrefLookups).push(pendingLookup(sources, query, index));
  }
  await Promise.all([
    resolveOneAtATime(crossrefLookups, resolutions),
    resolveOneAtATime(arxivLookups, resolutions),
  ]);
  return resolutions;
}

/** Keys are chosen in query order, so the same queries against the same answers give the same keys. */
export async function findCitations(
  queries: readonly string[],
  sources: CitationSources,
  options: FindCitationsOptions = {},
): Promise<CitationQueryResult[]> {
  if (queries.length > MAXIMUM_CITATION_QUERIES) {
    throw new TooManyCitationQueriesError(
      `Give at most ${MAXIMUM_CITATION_QUERIES} queries at a time; ${queries.length} were given.`,
    );
  }
  const classified = queries.map(classifyCitationQuery);
  const resolutions = await resolveAll(sources, classified);
  const writer = new CitationWriter(options.existingEntries ?? [], options.takenKeys ?? []);
  const written = new Map<Resolution, CitationQueryResult>();
  return resolutions.map((resolution, index) => {
    const query = queries[index] ?? "";
    const kind = classified[index]?.kind ?? "text";
    const earlier = written.get(resolution);
    if (earlier) return { ...earlier, query, kind };
    const result = writeResult(writer, resolution, query, kind);
    written.set(resolution, result);
    return result;
  });
}

function writeResult(
  writer: CitationWriter,
  resolution: Resolution,
  query: string,
  kind: CitationQueryKind,
): CitationQueryResult {
  if (resolution.outcome === "found") {
    return { query, kind, outcome: "found", citation: writer.chosen(resolution.draft) };
  }
  if (resolution.outcome === "candidates") {
    return {
      query,
      kind,
      outcome: "candidates",
      candidates: resolution.drafts.map((draft) => writer.offered(draft)),
    };
  }
  return { query, kind, outcome: resolution.outcome, detail: resolution.detail };
}
