import { parseBibliographyRecords } from "../../parseBibliographyRecords.js";
import {
  type BibtexEntryDraft,
  type BibtexFieldName,
  canonicalFieldName,
  createBibtexDraft,
} from "../bibtex/bibtexEntry.js";

/**
 * What doi.org answers for `Accept: application/x-bibtex`, rewritten the way every entry here
 * is written. Crossref answers on one line, with a key like `LeCun_2015`, a month as a bare
 * `May` or `June` (only `may` and `jun` are BibTeX macros), page ranges with an en dash, and a
 * `url` that repeats the DOI. DataCite uses a doi.org link as the key and adds `keywords` and
 * `copyright`. Fields outside the standard set, such as abstracts, ISSNs and keywords, are
 * dropped, and the key is replaced later.
 *
 * Crossref calls a book chapter `@inbook` and gives it a `booktitle`. Standard BibTeX styles read
 * an `@inbook` title as the book's and ignore `booktitle`, so such an entry becomes the
 * `@incollection` both BibTeX and biblatex read correctly.
 */

const DOI_LINK_PREFIX = /^https?:\/\/(?:dx\.)?doi\.org\//i;
const ENTRY_WITHOUT_KEY = /^(\s*@\s*[A-Za-z]+\s*\{)\s*,/;

function decodedLink(link: string): string {
  try {
    return decodeURIComponent(link);
  } catch {
    return link;
  }
}

function linksToDoi(url: string, doi: string): boolean {
  return decodedLink(url.trim()).replace(DOI_LINK_PREFIX, "").toLowerCase() === doi.toLowerCase();
}

/** Undefined when the answer holds no entry that can be read. */
export function normalizeDoiBibtex(doiBibtex: string): BibtexEntryDraft | undefined {
  const record = parseBibliographyRecords("doi.org", doiBibtex.replace(ENTRY_WITHOUT_KEY, "$1doi,"))[0];
  if (!record) return undefined;
  const fields: Partial<Record<BibtexFieldName, string>> = {};
  for (const [name, value] of record.fields) {
    const field = canonicalFieldName(name);
    if (field) fields[field] = value;
  }
  const doi = fields.doi === undefined ? undefined : fields.doi.trim().replace(DOI_LINK_PREFIX, "");
  const url =
    fields.url !== undefined && doi !== undefined && linksToDoi(fields.url, doi) ? undefined : fields.url;
  const entryType = record.entryType === "inbook" && fields.booktitle ? "incollection" : record.entryType;
  return createBibtexDraft(entryType, { ...fields, doi, url });
}
