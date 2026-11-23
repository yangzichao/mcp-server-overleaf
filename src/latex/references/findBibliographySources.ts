import { locationOf, type ScannedSource, type SourceLocation } from "../source/scannedSource.js";
import { type KeyOccurrence, splitKeys } from "./keyOccurrence.js";

/**
 * Where a document's citation keys come from: .bib files named by BibTeX's \bibliography
 * or biblatex's \addbibresource, and \bibitem entries in a hand-written thebibliography.
 */

export interface BibliographyResource {
  /** The file as TeX looks for it, with the .bib extension BibTeX adds. */
  readonly fileName: string;
  /** The command as it appears in the source, e.g. \bibliography{refs}. */
  readonly written: string;
  readonly location: SourceLocation;
}

const BIBTEX_PATTERN = /\\bibliography\s*\{([^{}]*)\}/g;
const BIBLATEX_PATTERN = /\\(addbibresource|addglobalbib|addsectionbib)\s*(?:(\[[^[\]]*\])\s*)?\{([^{}]*)\}/g;
const BIBITEM_PATTERN = /\\bibitem\s*(?:\[[^[\]]*\]\s*)?\{([^{}]*)\}/g;

function isRemote(options: string | undefined, fileName: string): boolean {
  return /location\s*=\s*remote/.test(options ?? "") || /^[a-z]+:\/\//i.test(fileName);
}

export function findBibliographyResources(source: ScannedSource): BibliographyResource[] {
  const resources: BibliographyResource[] = [];

  for (const match of source.text.matchAll(BIBTEX_PATTERN)) {
    const written = match[0];
    for (const name of splitKeys(match[1] ?? "", true)) {
      resources.push({
        fileName: name.toLowerCase().endsWith(".bib") ? name : `${name}.bib`,
        written,
        location: locationOf(source, match.index),
      });
    }
  }

  for (const match of source.text.matchAll(BIBLATEX_PATTERN)) {
    const fileName = (match[3] ?? "").trim();
    if (fileName === "" || fileName.includes("\\") || isRemote(match[2], fileName)) continue;
    resources.push({ fileName, written: match[0], location: locationOf(source, match.index) });
  }

  return resources;
}

export function findBibitems(source: ScannedSource): KeyOccurrence[] {
  return [...source.text.matchAll(BIBITEM_PATTERN)].flatMap((match) =>
    splitKeys(match[1] ?? "", false).map((key) => ({
      key,
      command: "bibitem",
      location: locationOf(source, match.index),
    })),
  );
}
