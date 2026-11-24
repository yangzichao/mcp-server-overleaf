import type { BibliographyReadingRules } from "../bibliography/bibliographyReadingRules.js";
import { type BibliographyFile, scanBibliographyFiles } from "../bibliography/scanBibliographyFiles.js";
import type { KeyOccurrence } from "./keyOccurrence.js";

/**
 * The entry keys of .bib files: `@article{smith2020,` defines smith2020, even when an error in
 * its fields stops BibTeX reading them. @string, @preamble and @comment define no key.
 */
export function parseBibliographyEntries(
  files: readonly BibliographyFile[],
  rules: BibliographyReadingRules,
): KeyOccurrence[] {
  return scanBibliographyFiles(files, rules).map((entry) => ({
    key: entry.key,
    command: entry.entryTypeInLowerCase,
    location: entry.location,
  }));
}
