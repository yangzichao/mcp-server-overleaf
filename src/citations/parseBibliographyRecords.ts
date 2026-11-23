import { scanBibliographyEntries } from "../latex/bibliography/scanBibliographyEntries.js";
import type { SourceLocation } from "../latex/source/scannedSource.js";

/**
 * Whole .bib entries with their fields, for the checks that need more than the key. Field
 * names are lower-cased; values keep their inner braces, so `{BERT}` survives for whoever
 * reads it, and concatenations with `#` are joined.
 */

export interface BibliographyRecord {
  readonly key: string;
  readonly entryType: string;
  readonly location: SourceLocation;
  readonly fields: ReadonlyMap<string, string>;
}

export function parseBibliographyRecords(path: string, bibliographySource: string): BibliographyRecord[] {
  return scanBibliographyEntries(path, bibliographySource).flatMap(
    ({ entryTypeInLowerCase, fields, ...entry }) =>
      fields === "cut short by an error" ? [] : [{ ...entry, entryType: entryTypeInLowerCase, fields }],
  );
}
