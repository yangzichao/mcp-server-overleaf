import { UNKNOWN_PROGRAM_READING_RULES } from "../../../latex/bibliography/bibliographyReadingRules.js";
import { scanBibliographyFiles } from "../../../latex/bibliography/scanBibliographyFiles.js";
import {
  type BibtexEntryDraft,
  type BibtexFieldName,
  canonicalFieldName,
  createBibtexDraft,
} from "../bibtex/bibtexEntry.js";

/**
 * What doi.org answers for `Accept: application/x-bibtex`, rewritten the way every entry here
 * is written. Crossref answers on one line, with a key like `LeCun_2015`, a month as a bare
 * `May` or `June` (BibTeX has a `may` macro but no `june`, so the name is kept as written), page
 * ranges with an en dash, and a `url` that repeats the DOI. DataCite uses a doi.org link as the
 * key and adds `keywords` and `copyright`. Fields outside the standard set, such as abstracts,
 * ISSNs and keywords, are dropped, and the key is replaced later.
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

/** Undefined when the answer holds no entry read to its end, as an answer cut off does not. */
export function normalizeDoiBibtex(doiBibtex: string): BibtexEntryDraft | undefined {
  const entry = scanBibliographyFiles(
    [{ path: "doi.org", text: doiBibtex.replace(ENTRY_WITHOUT_KEY, "$1doi,") }],
    UNKNOWN_PROGRAM_READING_RULES,
  ).find((scanned) => !scanned.cutShortByAnError);
  if (!entry) return undefined;
  const fields: Partial<Record<BibtexFieldName, string>> = {};
  for (const [name, value] of entry.fields) {
    const field = canonicalFieldName(name);
    if (field) fields[field] = value;
  }
  const doi = fields.doi === undefined ? undefined : fields.doi.trim().replace(DOI_LINK_PREFIX, "");
  const url =
    fields.url !== undefined && doi !== undefined && linksToDoi(fields.url, doi) ? undefined : fields.url;
  const writtenType = entry.entryTypeInLowerCase;
  const entryType = writtenType === "inbook" && fields.booktitle ? "incollection" : writtenType;
  return createBibtexDraft(entryType, { ...fields, doi, url });
}
