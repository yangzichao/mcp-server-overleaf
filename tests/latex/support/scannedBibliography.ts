import {
  BIBTEX_READING_RULES,
  type BibliographyReadingRules,
} from "../../../src/latex/bibliography/bibliographyReadingRules.js";
import {
  type BibliographyFile,
  scanBibliographyFiles,
} from "../../../src/latex/bibliography/scanBibliographyFiles.js";

/** Each entry as [key, fields], followed by "cut short by an error" when an error stopped it. */
export function keysAndFieldsOfFiles(files: readonly BibliographyFile[], rules: BibliographyReadingRules) {
  return scanBibliographyFiles(files, rules).map((entry) => {
    const fields = Object.fromEntries(entry.fields);
    return entry.cutShortByAnError ? [entry.key, fields, "cut short by an error"] : [entry.key, fields];
  });
}

export function keysAndFields(text: string, rules: BibliographyReadingRules = BIBTEX_READING_RULES) {
  return keysAndFieldsOfFiles([{ path: "refs.bib", text }], rules);
}

export function keysRead(text: string, rules: BibliographyReadingRules = BIBTEX_READING_RULES): string[] {
  return scanBibliographyFiles([{ path: "refs.bib", text }], rules).map((entry) => entry.key);
}
