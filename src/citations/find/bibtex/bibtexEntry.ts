import { cleanFieldText, isMonthMacro, normalizePages, toMonthMacro } from "./bibtexFieldValues.js";
import { protectTitleCapitals } from "./protectTitleCapitals.js";

/**
 * A BibTeX entry as this server writes one, whichever service the metadata came from: the
 * fields below and no others, always in this order, values in braces except a month macro,
 * and no comma after the last field.
 */

export const BIBTEX_FIELD_ORDER = [
  "author",
  "editor",
  "title",
  "booktitle",
  "journal",
  "volume",
  "number",
  "chapter",
  "pages",
  "year",
  "month",
  "publisher",
  "address",
  "organization",
  "school",
  "institution",
  "series",
  "edition",
  "howpublished",
  "isbn",
  "doi",
  "eprint",
  "archivePrefix",
  "primaryClass",
  "url",
  "note",
] as const;

export type BibtexFieldName = (typeof BIBTEX_FIELD_ORDER)[number];

/** Before a citation key is chosen for it. */
export interface BibtexEntryDraft {
  /** Lower case, as `article` or `inproceedings`. */
  readonly entryType: string;
  /** Values ready to write between braces; see `createBibtexDraft`. */
  readonly fields: ReadonlyMap<BibtexFieldName, string>;
}

export interface BibtexEntry extends BibtexEntryDraft {
  readonly key: string;
}

/** The spelling above for a field name written in any case, or undefined for one not written here. */
export function canonicalFieldName(name: string): BibtexFieldName | undefined {
  const lowered = name.toLowerCase();
  return BIBTEX_FIELD_ORDER.find((field) => field.toLowerCase() === lowered);
}

/** Identifiers and links are copied as given: `\url` and biblatex read them verbatim. */
const VERBATIM_FIELDS: ReadonlySet<BibtexFieldName> = new Set(["doi", "eprint", "url"]);

function cleanFieldValue(field: BibtexFieldName, value: string): string {
  if (VERBATIM_FIELDS.has(field)) return value.replace(/\s+/g, "").replace(/[{}]/g, "");
  if (field === "month") return toMonthMacro(value) ?? cleanFieldText(value);
  if (field === "pages") return normalizePages(cleanFieldText(value));
  if (field === "title") return protectTitleCapitals(cleanFieldText(value));
  return cleanFieldText(value);
}

/**
 * An entry from raw metadata text: entities decoded, JATS and HTML markup turned into LaTeX,
 * `&`, `%` and `#` escaped, page ranges and months normalised, and capitals in the title kept.
 * Fields left undefined or blank are dropped.
 */
export function createBibtexDraft(
  entryType: string,
  fields: Partial<Record<BibtexFieldName, string | undefined>>,
): BibtexEntryDraft {
  const cleaned = new Map<BibtexFieldName, string>();
  for (const field of BIBTEX_FIELD_ORDER) {
    const raw = fields[field];
    const value = raw === undefined ? "" : cleanFieldValue(field, raw);
    if (value !== "") cleaned.set(field, value);
  }
  return { entryType: entryType.toLowerCase(), fields: cleaned };
}

export function formatBibtexEntry(entry: BibtexEntry): string {
  const lines = BIBTEX_FIELD_ORDER.flatMap((field) => {
    const value = entry.fields.get(field);
    if (value === undefined) return [];
    return [`  ${field} = ${field === "month" && isMonthMacro(value) ? value : `{${value}}`}`];
  });
  return `@${entry.entryType}{${entry.key},\n${lines.join(",\n")}\n}`;
}

/** What a reference list needs that the source left out: someone to credit, a title, a year. */
export function findMissingFields(draft: BibtexEntryDraft): string[] {
  const missing: string[] = [];
  if (!draft.fields.has("author") && !draft.fields.has("editor")) missing.push("author");
  if (!draft.fields.has("title")) missing.push("title");
  if (!draft.fields.has("year")) missing.push("year");
  return missing;
}
