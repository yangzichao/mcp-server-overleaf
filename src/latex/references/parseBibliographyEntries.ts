import { scanBibliographyEntries } from "../bibliography/scanBibliographyEntries.js";
import type { KeyOccurrence } from "./keyOccurrence.js";

/**
 * The entry keys of a .bib file: `@article{smith2020,` defines smith2020, even when an error in
 * its fields stops BibTeX reading them. @string, @preamble and @comment define no key.
 */
export function parseBibliographyEntries(path: string, bibliographySource: string): KeyOccurrence[] {
  return scanBibliographyEntries(path, bibliographySource).map((entry) => ({
    key: entry.key,
    command: entry.entryType,
    location: entry.location,
  }));
}
