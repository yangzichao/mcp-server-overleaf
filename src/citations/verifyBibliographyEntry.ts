import { findArxivId, findDoi, findFirstAuthorFamilyName } from "./citationIdentifiers.js";
import type { IdentifierLookup, MetadataServices } from "./metadataServices/metadataServices.js";
import type { BibliographyRecord } from "./parseBibliographyRecords.js";
import { normalizeTitleWords, SAME_WORK_THRESHOLD, titleSimilarity } from "./titleSimilarity.js";

/**
 * Decides whether one .bib entry names a real, matching work.
 *
 * An identifier that resolves to a different title, or does not resolve at all, is a
 * problem: the entry points somewhere it should not. A title search that finds nothing is
 * weaker evidence, because books, theses, reports and web pages are often not in Crossref.
 */

export type IdentifierKind = "doi" | "arxiv";

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
  | { readonly kind: "no-close-match"; readonly closestTitle: string | undefined }
  | { readonly kind: "not-checked"; readonly reason: string };

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

  let best: { doi: string; title: string; similarity: number } | undefined;
  for (const candidate of search.candidates) {
    for (const candidateTitle of candidate.titles) {
      const similarity = titleSimilarity(title, candidateTitle);
      if (!best || similarity > best.similarity)
        best = { doi: candidate.doi, title: candidateTitle, similarity };
    }
  }
  if (best && best.similarity >= SAME_WORK_THRESHOLD) {
    return { kind: "confirmed", via: "search", identifier: best.doi };
  }
  return { kind: "no-close-match", closestTitle: best?.title };
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
