import type { BibliographyReadingRules } from "../latex/bibliography/bibliographyReadingRules.js";
import { type BibliographyFile, scanBibliographyFiles } from "../latex/bibliography/scanBibliographyFiles.js";
import type { SourceLocation } from "../latex/source/scannedSource.js";

/**
 * Whole .bib entries with their fields, for the checks that need more than the key. Field
 * names are lower-cased; values keep their inner braces, so `{BERT}` survives for whoever
 * reads it, macros are expanded and concatenations with `#` are joined. An entry an error cut
 * short keeps the fields read before the error, as BibTeX keeps them.
 */

export interface BibliographyRecord {
  readonly key: string;
  readonly entryType: string;
  readonly location: SourceLocation;
  readonly fields: ReadonlyMap<string, string>;
}

export function parseBibliographyRecords(
  files: readonly BibliographyFile[],
  rules: BibliographyReadingRules,
): BibliographyRecord[] {
  return scanBibliographyFiles(files, rules).map(({ entryTypeInLowerCase, key, location, fields }) => ({
    key,
    entryType: entryTypeInLowerCase,
    location,
    fields,
  }));
}
