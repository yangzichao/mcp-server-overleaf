import {
  type MissingProjectFile,
  type ProjectSourceReader,
  type VisitedSourceFile,
  walkIncludedFiles,
} from "../includes/walkIncludedFiles.js";
import { categorizeProjectFile } from "../latexProjectFiles.js";
import { directoryOf, findFirstExistingPath } from "../source/projectPaths.js";
import {
  findDuplicateDefinitions,
  findUndefinedUses,
  findUnusedDefinitions,
} from "./compareKeyOccurrences.js";
import {
  type BibliographyResource,
  findBibitems,
  findBibliographyResources,
} from "./findBibliographySources.js";
import { findCitations } from "./findCitations.js";
import {
  findGraphicsInclusions,
  findGraphicsPaths,
  resolveGraphicsInclusion,
} from "./findGraphicsInclusions.js";
import { findLabels, findReferences, PACKAGE_DEFINED_LABELS } from "./findLabelsAndReferences.js";
import type { KeyOccurrence } from "./keyOccurrence.js";
import { parseBibliographyEntries } from "./parseBibliographyEntries.js";
import type { ReferenceCheckReport } from "./referenceCheckReport.js";

/**
 * Checks a document's cross-references and citations from its source, the way a careful
 * co-author would before compiling: what is used but never defined, what is defined twice,
 * and which named files do not exist.
 */

interface BibliographyLookup {
  readonly entries: KeyOccurrence[];
  readonly files: string[];
  readonly missing: MissingProjectFile[];
}

async function readBibliographies(
  reader: ProjectSourceReader,
  resourcesByFile: ReadonlyArray<{ file: VisitedSourceFile; resource: BibliographyResource }>,
): Promise<BibliographyLookup> {
  const entries: KeyOccurrence[] = [];
  const files: string[] = [];
  const missing: MissingProjectFile[] = [];

  for (const { file, resource } of resourcesByFile) {
    const lookup = findFirstExistingPath(
      [file.baseDirectory, "", directoryOf(file.path)],
      [resource.fileName],
      reader.projectFiles,
    );
    if (!("found" in lookup)) {
      missing.push({ written: resource.written, location: resource.location, tried: lookup.tried });
      continue;
    }
    if (files.includes(lookup.found)) continue;
    files.push(lookup.found);
    entries.push(...parseBibliographyEntries(lookup.found, await reader.readTextFile(lookup.found)));
  }
  return { entries, files, missing };
}

function findMissingGraphics(visited: readonly VisitedSourceFile[], projectFiles: ReadonlySet<string>) {
  const graphicsPaths = visited.flatMap(findGraphicsPaths);
  const missing: MissingProjectFile[] = [];
  let pathsBuiltFromMacros = 0;
  for (const file of visited) {
    const scan = findGraphicsInclusions(file, graphicsPaths);
    pathsBuiltFromMacros += scan.pathsBuiltFromMacros;
    for (const inclusion of scan.inclusions) {
      const lookup = resolveGraphicsInclusion(inclusion, projectFiles);
      if ("tried" in lookup) {
        missing.push({ written: inclusion.written, location: inclusion.location, tried: lookup.tried });
      }
    }
  }
  return { missing, pathsBuiltFromMacros };
}

export async function checkProjectReferences(
  reader: ProjectSourceReader,
  mainTexFile: string,
): Promise<ReferenceCheckReport> {
  const walk = await walkIncludedFiles(reader, mainTexFile);
  const { visited } = walk;

  const labels = visited.flatMap(findLabels);
  const references = visited.flatMap(findReferences);
  const citationScans = visited.map(findCitations);
  const citations = citationScans.flatMap((scan) => scan.citations);
  const citesEveryEntry = citationScans.some((scan) => scan.citesEveryEntry);
  const bibitems = visited.flatMap(findBibitems);
  const bibliography = await readBibliographies(
    reader,
    visited.flatMap((file) => findBibliographyResources(file).map((resource) => ({ file, resource }))),
  );
  const graphics = findMissingGraphics(visited, reader.projectFiles);

  const bibliographyDefinitions = [...bibliography.entries, ...bibitems];
  const citationsNotCheckedBecause =
    bibliography.missing.length > 0 && bibitems.length === 0
      ? `${bibliography.missing.map((missing) => missing.written).join(", ")} names a file that does not exist`
      : undefined;
  const definedLabels = new Set([...labels.map((label) => label.key), ...PACKAGE_DEFINED_LABELS]);
  const visitedPaths = new Set(visited.map((file) => file.path));

  return {
    mainTexFile,
    checkedFiles: visited.map((file) => file.path),
    bibliographyFiles: bibliography.files,
    hasThebibliography: bibitems.length > 0,
    undefinedReferences: findUndefinedUses(references, definedLabels),
    undefinedCitations: citationsNotCheckedBecause
      ? []
      : findUndefinedUses(citations, new Set(bibliographyDefinitions.map((entry) => entry.key))),
    duplicateLabels: findDuplicateDefinitions(labels),
    // BibTeX matches keys without regard to case, so Smith2020 and smith2020 collide.
    duplicateBibliographyKeys: findDuplicateDefinitions(bibliographyDefinitions, (key) => key.toLowerCase()),
    missingFiles: [...walk.missingIncludes, ...bibliography.missing, ...graphics.missing],
    unusedLabels: findUnusedDefinitions(labels, new Set(references.map((reference) => reference.key))),
    unusedBibliographyEntries: citesEveryEntry
      ? []
      : findUnusedDefinitions(bibliographyDefinitions, new Set(citations.map((citation) => citation.key))),
    citesEveryEntry,
    citationsNotCheckedBecause,
    pathsBuiltFromMacros: walk.pathsBuiltFromMacros + graphics.pathsBuiltFromMacros,
    texFilesNotIncluded: [...reader.projectFiles]
      .filter((path) => categorizeProjectFile(path) === "tex" && !visitedPaths.has(path))
      .sort(),
  };
}
