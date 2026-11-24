import { listsAuthor } from "./authorNames.js";
import { findArxivId, findDoi, findFirstAuthorFamilyName } from "./citationIdentifiers.js";
import type {
  IdentifierLookup,
  MetadataServices,
  SearchCandidate,
} from "./metadataServices/metadataServices.js";
import type { BibliographyRecord } from "./parseBibliographyRecords.js";
import { normalizeTitleWords, SAME_WORK_THRESHOLD, titleSimilarity } from "./titleSimilarity.js";

/**
 * Decides whether one .bib entry names a real, matching work.
 *
 * An identifier that resolves to a different title, or does not resolve at all, is a
 * problem: the entry points somewhere it should not. A title search that finds nothing is
 * weaker evidence, because books, theses, reports and web pages are often not in Crossref.
 *
 * A title search confirms an entry only when a result also lists the entry's first author.
 * Titles repeat: "Generative Adversarial Nets" is both the 2014 NeurIPS paper, which has no
 * DOI, and a 2023 book chapter by someone else, which Crossref returns first.
 */

type IdentifierKind = "doi" | "arxiv";

export type CitationVerdict =
  | { readonly kind: "confirmed"; readonly via: IdentifierKind | "search"; readonly identifier: string }
  | {
      readonly kind: "title-mismatch";
      readonly via: IdentifierKind;
      readonly identifier: string;
      readonly registeredTitle: string;
    }
  | {
      readonly kind: "identifier-not-found";
      readonly via: IdentifierKind;
      readonly identifier: string;
      readonly detail: string;
    }
  | {
      readonly kind: "no-close-match";
      /** The family name a match had to list, when the entry gives one. */
      readonly searchedAuthor: string | undefined;
      readonly closest: ClosestSearchResult | undefined;
    }
  | { readonly kind: "not-checked"; readonly reason: string };

export interface ClosestSearchResult {
  readonly title: string;
  readonly firstAuthor: string | undefined;
  readonly year: number | undefined;
}

interface ScoredCandidate {
  readonly candidate: SearchCandidate;
  readonly title: string;
  readonly similarity: number;
}

function scoreCandidate(title: string, candidate: SearchCandidate): ScoredCandidate {
  let best: ScoredCandidate = { candidate, title: candidate.titles[0] ?? "", similarity: 0 };
  for (const candidateTitle of candidate.titles) {
    const similarity = titleSimilarity(title, candidateTitle);
    if (similarity > best.similarity) best = { candidate, title: candidateTitle, similarity };
  }
  return best;
}

function mostSimilar(scored: readonly ScoredCandidate[]): ScoredCandidate | undefined {
  return scored.reduce<ScoredCandidate | undefined>(
    (best, next) => (!best || next.similarity > best.similarity ? next : best),
    undefined,
  );
}

function bestSimilarity(title: string, candidates: readonly string[]): number {
  return Math.max(0, ...candidates.map((candidate) => titleSimilarity(title, candidate)));
}

function judgeIdentifier(
  via: IdentifierKind,
  identifier: string,
  lookup: IdentifierLookup,
  title: string | undefined,
): CitationVerdict | undefined {
  if (lookup.outcome === "unavailable") return undefined;
  if (lookup.outcome === "not-found")
    return { kind: "identifier-not-found", via, identifier, detail: lookup.detail };
  if (!title || lookup.titles.length === 0 || bestSimilarity(title, lookup.titles) >= SAME_WORK_THRESHOLD) {
    return { kind: "confirmed", via, identifier };
  }
  return { kind: "title-mismatch", via, identifier, registeredTitle: lookup.titles[0] ?? "" };
}

async function searchByTitle(
  record: BibliographyRecord,
  title: string,
  services: MetadataServices,
): Promise<CitationVerdict> {
  const query = [
    normalizeTitleWords(title).join(" "),
    findFirstAuthorFamilyName(record),
    record.fields.get("year")?.replace(/[{}]/g, ""),
  ]
    .filter(Boolean)
    .join(" ");
  const search = await services.searchCrossref(query);
  if (search.outcome === "unavailable") return { kind: "not-checked", reason: search.detail };

  const familyName = findFirstAuthorFamilyName(record);
  const scored = search.candidates.map((candidate) => scoreCandidate(title, candidate));
  const match = mostSimilar(
    scored.filter(
      ({ candidate, similarity }) =>
        similarity >= SAME_WORK_THRESHOLD &&
        (familyName === undefined || listsAuthor(candidate.authorNames, familyName)),
    ),
  );
  if (match) return { kind: "confirmed", via: "search", identifier: match.candidate.doi };

  const closest = mostSimilar(scored);
  return {
    kind: "no-close-match",
    searchedAuthor: familyName,
    closest: closest && {
      title: closest.title,
      firstAuthor: closest.candidate.authorNames[0],
      year: closest.candidate.year,
    },
  };
}

export async function verifyBibliographyEntry(
  record: BibliographyRecord,
  services: MetadataServices,
): Promise<CitationVerdict> {
  const title = record.fields.get("title");
  const unavailable: string[] = [];

  const doi = findDoi(record);
  if (doi) {
    const lookup = await services.lookupDoi(doi);
    const verdict = judgeIdentifier("doi", doi, lookup, title);
    if (verdict) return verdict;
    if (lookup.outcome === "unavailable") unavailable.push(lookup.detail);
  }

  const arxivId = findArxivId(record);
  if (arxivId) {
    const lookup = await services.lookupArxiv(arxivId);
    const verdict = judgeIdentifier("arxiv", arxivId, lookup, title);
    if (verdict) return verdict;
    if (lookup.outcome === "unavailable") unavailable.push(lookup.detail);
  }

  if (title) return searchByTitle(record, title, services);
  return {
    kind: "not-checked",
    reason: unavailable.length > 0 ? unavailable.join("; ") : "it has no title, DOI or arXiv id to look up",
  };
}
