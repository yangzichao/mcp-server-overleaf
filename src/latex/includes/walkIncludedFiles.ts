import { prepareLatexSource } from "../source/prepareLatexSource.js";
import { locationOf, type ScannedSource, type SourceLocation, scanSource } from "../source/scannedSource.js";
import {
  describeIncludeDirective,
  findIncludeDirectives,
  type IncludeDirective,
} from "./findIncludeDirectives.js";
import { resolveIncludeTarget } from "./resolveIncludeTarget.js";

/**
 * Reads a document the way TeX would: the root file, then every file it includes, in the
 * order they appear. Each file is visited once, so a file included twice or an include
 * cycle cannot loop.
 */

export interface ProjectSourceReader {
  /** Every path in the project, including binary files that are never read. */
  readonly projectFiles: ReadonlySet<string>;
  readTextFile(path: string): Promise<string>;
}

export interface ResolvedIncludeDirective {
  readonly directive: IncludeDirective;
  /** The project file it pulls in, or undefined when none exists. */
  readonly includedPath: string | undefined;
}

export interface VisitedSourceFile extends ScannedSource {
  readonly baseDirectory: string;
  readonly includes: ResolvedIncludeDirective[];
}

export interface MissingProjectFile {
  /** The command as it appears in the source, e.g. \input{sections/intro}. */
  readonly written: string;
  readonly location: SourceLocation;
  readonly tried: readonly string[];
}

export interface IncludeWalk {
  /** In document order, the root first. */
  readonly visited: VisitedSourceFile[];
  readonly missingIncludes: MissingProjectFile[];
  readonly pathsBuiltFromMacros: number;
}

/** Deeper than any real document nests; a guard against a pathological project, not a limit anyone meets. */
export const MAXIMUM_INCLUDE_DEPTH = 32;

export async function walkIncludedFiles(reader: ProjectSourceReader, rootPath: string): Promise<IncludeWalk> {
  const visited: VisitedSourceFile[] = [];
  const missingIncludes: MissingProjectFile[] = [];
  const seen = new Set<string>([rootPath]);
  let pathsBuiltFromMacros = 0;

  async function visit(path: string, baseDirectory: string, depth: number): Promise<void> {
    const source = scanSource(path, prepareLatexSource(await reader.readTextFile(path)));
    const scan = findIncludeDirectives(source);
    pathsBuiltFromMacros += scan.pathsBuiltFromMacros;

    const includes: ResolvedIncludeDirective[] = [];
    const file: VisitedSourceFile = { ...source, baseDirectory, includes };
    visited.push(file);

    for (const directive of scan.directives) {
      const resolution = resolveIncludeTarget(directive, file, reader.projectFiles);
      includes.push({ directive, includedPath: resolution.path });
      if (resolution.path === undefined) {
        missingIncludes.push({
          written: describeIncludeDirective(directive),
          location: locationOf(source, directive.index),
          tried: resolution.tried,
        });
        continue;
      }
      if (seen.has(resolution.path) || depth >= MAXIMUM_INCLUDE_DEPTH) continue;
      seen.add(resolution.path);
      await visit(resolution.path, resolution.baseDirectory, depth + 1);
    }
  }

  await visit(rootPath, "", 0);
  return { visited, missingIncludes, pathsBuiltFromMacros };
}
