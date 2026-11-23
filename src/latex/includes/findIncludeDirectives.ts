import type { ScannedSource } from "../source/scannedSource.js";

/**
 * The commands that pull another .tex file into the document. Each is read with its path
 * exactly as written; resolving that path against the project is `resolveIncludeTarget`'s job.
 */

export interface IncludeDirective {
  /** The command as written, without the backslash: input, include, subimport, … */
  readonly command: string;
  /** The file name as written, without the directory an import-style command gives separately. */
  readonly fileName: string;
  /** The directory an import-style command names; undefined for \input and its kind. */
  readonly importDirectory: string | undefined;
  /** True for the sub- forms of import, whose directory is relative to the including file. */
  readonly importIsRelative: boolean;
  /** \include always appends .tex; \input appends it only when the name has none. */
  readonly alwaysAddsTexExtension: boolean;
  readonly index: number;
  /** How many characters the whole directive spans in the source, from its backslash on. */
  readonly length: number;
}

export interface IncludeDirectiveScan {
  readonly directives: IncludeDirective[];
  /** Paths built from macros, such as \input{\chapterdir/intro}, which no static check can follow. */
  readonly pathsBuiltFromMacros: number;
}

const SIMPLE_INCLUDE_PATTERN = /\\(input|include|subfile)\s*\{([^{}]*)\}/g;
const IMPORT_PATTERN =
  /\\(import|subimport|inputfrom|subinputfrom|includefrom|subincludefrom)\*?\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;

export function isBuiltFromMacros(writtenPath: string): boolean {
  return writtenPath.includes("\\") || writtenPath.includes("#");
}

/** Reads one match as a directive, or as a path no static check can follow. */
function readDirective(
  match: RegExpMatchArray,
  isImport: boolean,
): IncludeDirective | "built-from-macros" | null {
  const command = match[1] ?? "input";
  const importDirectory = isImport ? (match[2] ?? "").trim() : undefined;
  const fileName = (match[isImport ? 3 : 2] ?? "").trim();
  if (fileName === "") return null;
  if (isBuiltFromMacros(fileName) || isBuiltFromMacros(importDirectory ?? "")) return "built-from-macros";
  return {
    command,
    fileName,
    importDirectory,
    importIsRelative: isImport && command.startsWith("sub"),
    alwaysAddsTexExtension: command.includes("include"),
    index: match.index ?? 0,
    length: match[0].length,
  };
}

export function findIncludeDirectives(source: ScannedSource): IncludeDirectiveScan {
  const directives: IncludeDirective[] = [];
  let pathsBuiltFromMacros = 0;
  const matches = [
    ...[...source.text.matchAll(SIMPLE_INCLUDE_PATTERN)].map((match) => readDirective(match, false)),
    ...[...source.text.matchAll(IMPORT_PATTERN)].map((match) => readDirective(match, true)),
  ];
  for (const directive of matches) {
    if (directive === "built-from-macros") pathsBuiltFromMacros += 1;
    else if (directive) directives.push(directive);
  }
  directives.sort((left, right) => left.index - right.index);
  return { directives, pathsBuiltFromMacros };
}

/** The directive as a reader would recognise it in the source. */
export function describeIncludeDirective(directive: IncludeDirective): string {
  return directive.importDirectory === undefined
    ? `\\${directive.command}{${directive.fileName}}`
    : `\\${directive.command}{${directive.importDirectory}}{${directive.fileName}}`;
}
