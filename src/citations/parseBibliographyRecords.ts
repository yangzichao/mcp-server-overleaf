import { scanBibliographyEntries } from "../latex/bibliography/scanBibliographyEntries.js";
import type { SourceLocation } from "../latex/source/scannedSource.js";

/**
 * Whole .bib entries with their fields, for the checks that need more than the key. Field
 * names are lower-cased; values keep their inner braces, so `{BERT}` survives for whoever
 * reads it, and concatenations with `#` are joined. An entry with an error in its fields is
 * left out, and reading goes on from the error, as BibTeX's does.
 */

export interface BibliographyRecord {
  readonly key: string;
  readonly entryType: string;
  readonly location: SourceLocation;
  readonly fields: ReadonlyMap<string, string>;
}

export function parseBibliographyRecords(path: string, bibliographySource: string): BibliographyRecord[] {
  return scanBibliographyEntries(path, bibliographySource).flatMap(({ fields, ...entry }) =>
    fields === null ? [] : [{ ...entry, fields }],
  );
}
