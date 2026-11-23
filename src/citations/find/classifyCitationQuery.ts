/**
 * What a citation query names: a DOI, an arXiv paper, or neither, in which case it is free
 * text to search for. Identifiers are recognised in the forms people paste: bare, with a
 * `doi:` or `arXiv:` prefix, or as a doi.org or arxiv.org link.
 */

export type ClassifiedCitationQuery =
  | { readonly kind: "doi"; readonly doi: string }
  | { readonly kind: "arxiv"; readonly arxivId: string }
  | { readonly kind: "text"; readonly text: string };

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
const DOI_PREFIX_PATTERN = /^(?:doi:\s*|(?:https?:\/\/)?(?:dx\.)?doi\.org\/)/i;
/** arXiv's own DOIs, registered with DataCite, name the same paper as the id inside them. */
const ARXIV_DOI_PATTERN = /^10\.48550\/arxiv\.(.+)$/i;

const NEW_ARXIV_ID = /^\d{4}\.\d{4,5}(?:v\d+)?$/;
const OLD_ARXIV_ID = /^[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?$/;
const ARXIV_PREFIX_PATTERN = /^arxiv\s*:?\s*/i;
const ARXIV_LINK_PATTERN =
  /^(?:https?:\/\/)?(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf)\/([^\s?#]+?)(?:\.pdf)?\/?(?:[?#].*)?$/i;

/** The id as written, or lower-cased for a pasted `V2` or `HEP-TH/...`; old ids keep a subject class like `math.GT`. */
function asArxivId(candidate: string): string | undefined {
  for (const form of [candidate, candidate.toLowerCase()]) {
    if (NEW_ARXIV_ID.test(form) || OLD_ARXIV_ID.test(form)) return form;
  }
  return undefined;
}

function classifyArxiv(query: string): string | undefined {
  const fromLink = ARXIV_LINK_PATTERN.exec(query)?.[1];
  if (fromLink) return asArxivId(fromLink);
  return asArxivId(query.replace(ARXIV_PREFIX_PATTERN, ""));
}

export function classifyCitationQuery(query: string): ClassifiedCitationQuery {
  const trimmed = query.trim();
  const doi = trimmed.replace(DOI_PREFIX_PATTERN, "");
  if (DOI_PATTERN.test(doi)) {
    const arxivId = asArxivId(ARXIV_DOI_PATTERN.exec(doi)?.[1] ?? "");
    return arxivId ? { kind: "arxiv", arxivId } : { kind: "doi", doi };
  }
  const arxivId = classifyArxiv(trimmed);
  return arxivId ? { kind: "arxiv", arxivId } : { kind: "text", text: trimmed.replace(/\s+/g, " ") };
}
