import type { ScannedSource } from "../source/scannedSource.js";
import {
  BIBER_READING_RULES,
  BIBTEX_READING_RULES,
  type BibliographyReadingRules,
} from "./bibliographyReadingRules.js";

const PACKAGE_LOADING_PATTERN = /\\(?:usepackage|RequirePackage)\s*(?:\[([^[\]]*)\]\s*)?\{([^{}]*)\}/g;
const BIBLATEX_RESOURCE_PATTERN = /\\(?:addbibresource|addglobalbib|addsectionbib)(?![A-Za-z])/;
const BIBTEX_BACKEND_PATTERN = /(?:^|,)\s*backend\s*=\s*bibtex[8u]?\s*(?:,|$)/;

function biblatexOptionLists(source: ScannedSource): string[] {
  return [...source.text.matchAll(PACKAGE_LOADING_PATTERN)]
    .filter((match) => (match[2] ?? "").split(",").some((name) => name.trim() === "biblatex"))
    .map((match) => match[1] ?? "");
}

/**
 * biber reads the .bib files of a document that loads biblatex, unless biblatex is loaded with
 * backend=bibtex, bibtex8 or bibtexu, which are read here as BibTeX reads them. A class that
 * loads biblatex itself shows only in the \addbibresource that names the files.
 */
export function chooseBibliographyReadingRules(visited: readonly ScannedSource[]): BibliographyReadingRules {
  const optionLists = visited.flatMap(biblatexOptionLists);
  const loadsBiblatex =
    optionLists.length > 0 || visited.some((source) => BIBLATEX_RESOURCE_PATTERN.test(source.text));
  if (!loadsBiblatex || optionLists.some((options) => BIBTEX_BACKEND_PATTERN.test(options))) {
    return BIBTEX_READING_RULES;
  }
  return BIBER_READING_RULES;
}
