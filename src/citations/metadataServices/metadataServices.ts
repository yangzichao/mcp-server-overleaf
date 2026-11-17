/**
 * What the citation check asks of the outside world, kept behind an interface so the
 * verdict logic can be tested without a network and the services can change underneath it.
 */

export type IdentifierLookup =
  /** `titles` holds each form worth comparing: the title alone, and with its subtitle. */
  | { readonly outcome: "found"; readonly titles: string[] }
  | { readonly outcome: "not-found"; readonly detail: string }
  | { readonly outcome: "unavailable"; readonly detail: string };

export interface SearchCandidate {
  readonly doi: string;
  readonly titles: string[];
  /** Family names, or an organisation's name, in the registry's author order. */
  readonly authorNames: string[];
  readonly year: number | undefined;
}

export type SearchLookup =
  | { readonly outcome: "searched"; readonly candidates: SearchCandidate[] }
  | { readonly outcome: "unavailable"; readonly detail: string };

export interface MetadataServices {
  lookupDoi(doi: string): Promise<IdentifierLookup>;
  lookupArxiv(arxivId: string): Promise<IdentifierLookup>;
  searchCrossref(bibliographicQuery: string): Promise<SearchLookup>;
}

/** A string, or the first string of an array, which is how CSL JSON and Crossref hold titles. */
export function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/** The title on its own and joined to its subtitle, since a .bib file may hold either. */
export function titleForms(title: string | undefined, subtitle: string | undefined): string[] {
  if (!title) return [];
  return subtitle ? [title, `${title}: ${subtitle}`] : [title];
}
