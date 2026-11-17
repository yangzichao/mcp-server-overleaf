import { locationOf, scanSource } from "../source/scannedSource.js";
import type { KeyOccurrence } from "./keyOccurrence.js";

/**
 * The entry keys of a .bib file: `@article{smith2020,` defines smith2020. @string,
 * @preamble and @comment define no key. A line starting with `%` is skipped, as biber
 * skips it, even though classic BibTeX would not.
 */

const ENTRY_PATTERN = /@\s*([A-Za-z]+)\s*[{(]\s*([^,\s{}()"#%'=]+)\s*,/g;
const NOT_AN_ENTRY = new Set(["string", "preamble", "comment"]);

export function parseBibliographyEntries(path: string, bibliographySource: string): KeyOccurrence[] {
  const withoutCommentLines = bibliographySource.replace(/^[ \t]*%.*$/gm, "");
  const source = scanSource(path, withoutCommentLines);
  const entries: KeyOccurrence[] = [];

  for (const match of source.text.matchAll(ENTRY_PATTERN)) {
    const entryType = (match[1] ?? "").toLowerCase();
    if (NOT_AN_ENTRY.has(entryType)) continue;
    entries.push({ key: match[2] ?? "", command: entryType, location: locationOf(source, match.index) });
  }
  return entries;
}
