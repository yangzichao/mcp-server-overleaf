import { directoryOf, findFirstExistingPath, joinProjectPath } from "../source/projectPaths.js";
import type { IncludeDirective } from "./findIncludeDirectives.js";

/**
 * Finds the project file an include directive means.
 *
 * TeX resolves `\input` against the directory it runs in, which on Overleaf is the project
 * root. The import package changes that for the files it pulls in, so each included file
 * carries the directory its own relative paths start from. Where the packages disagree in
 * edge cases, the including file's own directory is tried last, because a reader who wrote
 * `\input{intro}` next to `chapters/intro.tex` meant that file.
 */

export interface IncludingFile {
  readonly path: string;
  /** The directory relative paths in this file resolve against: the root, or an import's directory. */
  readonly baseDirectory: string;
}

export type IncludeResolution =
  | { readonly path: string; readonly baseDirectory: string }
  | { readonly path: undefined; readonly tried: string[] };

function candidateFileNames(directive: IncludeDirective): string[] {
  const { fileName } = directive;
  if (fileName.toLowerCase().endsWith(".tex")) return [fileName];
  return directive.alwaysAddsTexExtension ? [`${fileName}.tex`] : [`${fileName}.tex`, fileName];
}

function importedDirectories(directive: IncludeDirective, includer: IncludingFile): string[] {
  const writtenDirectory = directive.importDirectory ?? "";
  const starts = directive.importIsRelative ? [includer.baseDirectory, directoryOf(includer.path)] : [""];
  return starts.map((start) => joinProjectPath(start, writtenDirectory) ?? "");
}

export function resolveIncludeTarget(
  directive: IncludeDirective,
  includer: IncludingFile,
  projectFiles: ReadonlySet<string>,
): IncludeResolution {
  const fileNames = candidateFileNames(directive);

  if (directive.importDirectory !== undefined) {
    const tried: string[] = [];
    for (const directory of importedDirectories(directive, includer)) {
      const lookup = findFirstExistingPath([directory], fileNames, projectFiles);
      if ("found" in lookup) return { path: lookup.found, baseDirectory: directory };
      tried.push(...lookup.tried.filter((candidate) => !tried.includes(candidate)));
    }
    return { path: undefined, tried };
  }

  const lookup = findFirstExistingPath(
    [includer.baseDirectory, "", directoryOf(includer.path)],
    fileNames,
    projectFiles,
  );
  return "found" in lookup
    ? { path: lookup.found, baseDirectory: includer.baseDirectory }
    : { path: undefined, tried: lookup.tried };
}
