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
}

export type SearchLookup =
  | { readonly outcome: "searched"; readonly candidates: SearchCandidate[] }
  | { readonly outcome: "unavailable"; readonly detail: string };

export interface MetadataServices {
  lookupDoi(doi: string): Promise<IdentifierLookup>;
  lookupArxiv(arxivId: string): Promise<IdentifierLookup>;
  searchCrossref(bibliographicQuery: string): Promise<SearchLookup>;
}

/** The title on its own and joined to its subtitle, since a .bib file may hold either. */
export function titleForms(title: string | undefined, subtitle: string | undefined): string[] {
  if (!title) return [];
  return subtitle ? [title, `${title}: ${subtitle}`] : [title];
}
