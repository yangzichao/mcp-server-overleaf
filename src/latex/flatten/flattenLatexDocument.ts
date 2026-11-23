import {
  describeIncludeDirective,
  findIncludeDirectives,
  type IncludeDirective,
} from "../includes/findIncludeDirectives.js";
import { resolveIncludeTarget } from "../includes/resolveIncludeTarget.js";
import {
  MAXIMUM_INCLUDE_DEPTH,
  type MissingProjectFile,
  type ProjectSourceReader,
} from "../includes/walkIncludedFiles.js";
import { maskLatexSource } from "../source/prepareLatexSource.js";
import { locationOf, type ScannedSource, type SourceLocation, scanSource } from "../source/scannedSource.js";
import { beginInlinedFileMarker, endInlinedFileMarker, notInlinedMarker } from "./flattenMarkers.js";
import { findInlinedRegion } from "./inlinedRegion.js";

/** An include that resolved to a file but stayed as written, with the reason. */
export interface SkippedInclude {
  readonly written: string;
  readonly location: SourceLocation;
  readonly reason: string;
}

export interface FlattenedLatexDocument {
  readonly text: string;
  /** Every file inlined at least once, in the order first reached; the root is not listed. */
  readonly inlinedFiles: readonly string[];
  /** Includes naming no project file; each stays in the text after a marker comment. */
  readonly missingIncludes: readonly MissingProjectFile[];
  /** Include cycles, nesting past the depth limit, and files that could not be read as text. */
  readonly skippedIncludes: readonly SkippedInclude[];
  /** Includes whose path is built from macros, such as \input{\dir/intro}; left as written. */
  readonly pathsBuiltFromMacros: number;
}

/** Far beyond any paper; reached only when files are included inside each other many times over. */
export const MAXIMUM_FLATTENED_LENGTH = 10_000_000;

export class FlattenedDocumentTooLongError extends Error {}

interface FileBeingFlattened {
  readonly path: string;
  readonly baseDirectory: string;
  /** The root first, this file last: an include of any of them is a cycle. */
  readonly includeChain: readonly string[];
  readonly original: string;
  readonly masked: string;
  readonly scanned: ScannedSource;
  readonly regionEnd: number;
}

/** True when only spaces stand between the last line break written so far and the directive. */
function endsAtLineStart(flattenedSoFar: string): boolean {
  return flattenedSoFar.slice(flattenedSoFar.lastIndexOf("\n") + 1).trim() === "";
}

function isRestOfLineBlank(file: FileBeingFlattened, from: number): boolean {
  const newline = file.masked.indexOf("\n", from);
  const lineEnd = Math.min(newline === -1 ? file.masked.length : newline, file.regionEnd);
  return file.masked.slice(from, lineEnd).trim() === "";
}

/**
 * The text that takes an inlined include's place. A directive in the middle of a line gets a
 * `%` line break first, so the begin marker starts a line without adding a space. The end
 * marker takes the rest of the line when that is blank or a comment, which drops the line's
 * newline as latexpand does: kept, it would follow the file's own last newline and make an
 * empty line, a paragraph break TeX never saw. `\include` is wrapped in `\clearpage{}`, as
 * LaTeX's \include and latexpand do.
 */
function inlinedText(
  directive: IncludeDirective,
  includedPath: string,
  content: string,
  file: FileBeingFlattened,
  atLineStart: boolean,
): string {
  const lineBreak = atLineStart ? "" : "%\n";
  const body = content === "" || content.endsWith("\n") ? content : `${content}\n`;
  const marked = `${beginInlinedFileMarker(includedPath, describeIncludeDirective(directive))}${body}${endInlinedFileMarker(includedPath)}`;
  if (directive.command.includes("include")) return `${lineBreak}\\clearpage{}%\n${marked}\n\\clearpage{}`;
  return `${lineBreak}${marked}${isRestOfLineBlank(file, directive.index + directive.length) ? "" : "\n"}`;
}

class DocumentFlattener {
  readonly inlinedFiles = new Set<string>();
  readonly missingIncludes: MissingProjectFile[] = [];
  readonly skippedIncludes: SkippedInclude[] = [];
  pathsBuiltFromMacros = 0;
  private readonly texts = new Map<string, Promise<string>>();

  constructor(private readonly reader: ProjectSourceReader) {}

  readText(path: string): Promise<string> {
    let text = this.texts.get(path);
    if (!text) {
      text = this.reader.readTextFile(path);
      this.texts.set(path, text);
    }
    return text;
  }

  async flattenFile(
    path: string,
    original: string,
    baseDirectory: string,
    includeChain: readonly string[],
    isSubfile: boolean,
  ): Promise<string> {
    const masked = maskLatexSource(original);
    const region = findInlinedRegion(masked, isSubfile);
    const scanned = scanSource(path, masked);
    const file: FileBeingFlattened = {
      path,
      baseDirectory,
      includeChain,
      original,
      masked,
      scanned,
      regionEnd: region.end,
    };
    const scan = findIncludeDirectives(scanned);
    this.pathsBuiltFromMacros += scan.pathsBuiltFromMacros;

    let flattened = "";
    let cursor = region.start;
    for (const directive of scan.directives) {
      if (directive.index < cursor || directive.index + directive.length > region.end) continue;
      flattened += original.slice(cursor, directive.index);
      flattened += await this.replaceDirective(directive, file, endsAtLineStart(flattened));
      cursor = directive.index + directive.length;
    }
    return flattened + original.slice(cursor, region.end) + original.slice(region.tailStart, region.tailEnd);
  }

  private leaveAsWritten(
    directive: IncludeDirective,
    file: FileBeingFlattened,
    atLineStart: boolean,
    reason: string,
  ): string {
    const lineBreak = atLineStart ? "" : "%\n";
    const asWritten = file.original.slice(directive.index, directive.index + directive.length);
    return `${lineBreak}${notInlinedMarker(reason)}${asWritten}`;
  }

  private async replaceDirective(
    directive: IncludeDirective,
    file: FileBeingFlattened,
    atLineStart: boolean,
  ): Promise<string> {
    const written = describeIncludeDirective(directive);
    const location = locationOf(file.scanned, directive.index);
    const resolution = resolveIncludeTarget(directive, file, this.reader.projectFiles);
    if (resolution.path === undefined) {
      this.missingIncludes.push({ written, location, tried: resolution.tried });
      return this.leaveAsWritten(
        directive,
        file,
        atLineStart,
        `no such file, tried ${resolution.tried.join(", ")}`,
      );
    }
    const includedPath = resolution.path;
    const skip = (reason: string) => {
      this.skippedIncludes.push({ written, location, reason });
      return this.leaveAsWritten(directive, file, atLineStart, reason);
    };
    if (file.includeChain.includes(includedPath)) {
      return skip(`${includedPath} is already being inlined here, an include cycle`);
    }
    if (file.includeChain.length > MAXIMUM_INCLUDE_DEPTH) {
      return skip(`includes nest more than ${MAXIMUM_INCLUDE_DEPTH} deep`);
    }
    let original: string;
    try {
      original = await this.readText(includedPath);
    } catch (error) {
      return skip(`${includedPath} could not be read as text: ${(error as Error).message}`);
    }
    this.inlinedFiles.add(includedPath);
    const content = await this.flattenFile(
      includedPath,
      original,
      resolution.baseDirectory,
      [...file.includeChain, includedPath],
      directive.command === "subfile",
    );
    if (content.length > MAXIMUM_FLATTENED_LENGTH) {
      throw new FlattenedDocumentTooLongError(
        `The flattened document would pass ${MAXIMUM_FLATTENED_LENGTH} characters; ${includedPath} is included inside itself many times over.`,
      );
    }
    return inlinedText(directive, includedPath, content, file, atLineStart);
  }
}

/**
 * The document as one file: every `\input`, `\include`, `\subfile` and import-package command
 * replaced by the file it names, recursively, the way latexpand flattens a paper. Comments are
 * kept, commented-out directives and those inside verbatim-like environments are not followed,
 * and each inlined file is framed by begin and end marker comments. An include that names no
 * file, or that would loop, stays as written after a marker comment saying why.
 */
export async function flattenLatexDocument(
  reader: ProjectSourceReader,
  rootPath: string,
): Promise<FlattenedLatexDocument> {
  const flattener = new DocumentFlattener(reader);
  const text = await flattener.flattenFile(
    rootPath,
    await flattener.readText(rootPath),
    "",
    [rootPath],
    false,
  );
  if (text.length > MAXIMUM_FLATTENED_LENGTH) {
    throw new FlattenedDocumentTooLongError(
      `The flattened document would pass ${MAXIMUM_FLATTENED_LENGTH} characters, too long to return.`,
    );
  }
  return {
    text,
    inlinedFiles: [...flattener.inlinedFiles],
    missingIncludes: flattener.missingIncludes,
    skippedIncludes: flattener.skippedIncludes,
    pathsBuiltFromMacros: flattener.pathsBuiltFromMacros,
  };
}
