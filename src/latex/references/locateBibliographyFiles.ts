import type { MissingProjectFile, VisitedSourceFile } from "../includes/walkIncludedFiles.js";
import { directoryOf, findFirstExistingPath } from "../source/projectPaths.js";
import { findBibliographyResources } from "./findBibliographySources.js";

/** The .bib files a document names, in the order it names them, and the ones that do not exist. */
export function locateBibliographyFiles(
  visited: readonly VisitedSourceFile[],
  projectFiles: ReadonlySet<string>,
): { files: string[]; missing: MissingProjectFile[] } {
  const files: string[] = [];
  const missing: MissingProjectFile[] = [];

  for (const file of visited) {
    for (const resource of findBibliographyResources(file)) {
      const lookup = findFirstExistingPath(
        [file.baseDirectory, "", directoryOf(file.path)],
        [resource.fileName],
        projectFiles,
      );
      if ("found" in lookup) {
        if (!files.includes(lookup.found)) files.push(lookup.found);
      } else {
        missing.push({ written: resource.written, location: resource.location, tried: lookup.tried });
      }
    }
  }
  return { files, missing };
}
