import type { SkippedInclude } from "../../../../src/latex/flatten/flattenLatexDocument.js";
import type { IncludeDirective } from "../../../../src/latex/includes/findIncludeDirectives.js";
import { resolveIncludeTarget } from "../../../../src/latex/includes/resolveIncludeTarget.js";
import type { MissingProjectFile } from "../../../../src/latex/includes/walkIncludedFiles.js";
import {
  type GeneratedDirective,
  type GeneratedFile,
  type GeneratedProject,
  type LinePiece,
  ROOT_PATH,
  renderDirective,
  renderOpaqueBlock,
} from "./generatedLatexProject.js";

/**
 * What flattening a generated project should give, worked out from the pieces the project was
 * built from rather than by scanning its text: which directives are live, where each line
 * starts, and what follows a directive on its line are all known by construction.
 */

export interface ExpectedFlattening {
  readonly text: string;
  readonly inlinedFiles: readonly string[];
  readonly missingIncludes: readonly MissingProjectFile[];
  readonly skippedIncludes: readonly SkippedInclude[];
}

export const UNREADABLE_MESSAGE = "not text";

/** The directive as the include scanner reads it: names trimmed, the extension rule by command. */
function asIncludeDirective(directive: GeneratedDirective): IncludeDirective {
  const isImport = directive.kind === "import";
  return {
    command: directive.command,
    fileName: directive.fileName.trim(),
    importDirectory: isImport ? directive.importDirectory.trim() : undefined,
    importIsRelative: isImport && directive.command.startsWith("sub"),
    alwaysAddsTexExtension: directive.command.includes("include"),
    index: 0,
    length: 0,
  };
}

function describeWritten(directive: GeneratedDirective): string {
  return directive.kind === "import"
    ? `\\${directive.command}{${directive.importDirectory.trim()}}{${directive.fileName.trim()}}`
    : `\\${directive.command}{${directive.fileName.trim()}}`;
}

function atLineStart(text: string): boolean {
  return text.slice(text.lastIndexOf("\n") + 1).trim() === "";
}

/** Blank text or a comment, and no further directive, up to the end of the line. */
function isRestOfLineBlank(rest: readonly LinePiece[]): boolean {
  return rest.every((piece) => piece.kind === "text" && piece.text.trim() === "");
}

interface FileInProgress {
  readonly path: string;
  readonly baseDirectory: string;
  readonly includeChain: readonly string[];
  line: number;
}

class ExpectedFlattener {
  readonly inlinedFiles: string[] = [];
  readonly missingIncludes: MissingProjectFile[] = [];
  readonly skippedIncludes: SkippedInclude[] = [];
  private readonly projectFiles: ReadonlySet<string>;

  constructor(private readonly project: GeneratedProject) {
    this.projectFiles = new Set([...project.textFiles.keys(), ...project.binaryFiles]);
  }

  flatten(path: string, baseDirectory: string, includeChain: readonly string[]): string {
    const file = this.project.textFiles.get(path) as GeneratedFile;
    const progress: FileInProgress = { path, baseDirectory, includeChain, line: 1 };
    let text = "";
    file.lines.forEach((line, lineIndex) => {
      if (line.kind === "opaque") {
        text += renderOpaqueBlock(line, file.lineEnd);
        progress.line += line.body.length + 1;
      } else {
        line.pieces.forEach((piece, pieceIndex) => {
          if (piece.kind === "text") text += piece.text;
          else {
            const restBlank = isRestOfLineBlank(line.pieces.slice(pieceIndex + 1));
            text += this.replace(piece.directive, progress, atLineStart(text), restBlank);
          }
        });
        text += line.comment;
      }
      if (lineIndex < file.lines.length - 1 || file.finalNewline) text += file.lineEnd;
      progress.line += 1;
    });
    return text;
  }

  private replace(
    directive: GeneratedDirective,
    file: FileInProgress,
    lineStart: boolean,
    restBlank: boolean,
  ): string {
    const lineBreak = lineStart ? "" : "%\n";
    const written = describeWritten(directive);
    const location = { path: file.path, line: file.line };
    const leftAsWritten = (reason: string) =>
      `${lineBreak}% ---- not inlined: ${reason} ----\n${renderDirective(directive)}`;
    const resolution = resolveIncludeTarget(asIncludeDirective(directive), file, this.projectFiles);
    if (resolution.path === undefined) {
      this.missingIncludes.push({ written, location, tried: resolution.tried });
      return leftAsWritten(`no such file, tried ${resolution.tried.join(", ")}`.trim());
    }
    const includedPath = resolution.path;
    const skip = (reason: string) => {
      this.skippedIncludes.push({ written, location, reason });
      return leftAsWritten(reason);
    };
    if (file.includeChain.includes(includedPath)) {
      return skip(`${includedPath} is already being inlined here, an include cycle`);
    }
    if (!this.project.textFiles.has(includedPath)) {
      return skip(`${includedPath} could not be read as text: ${UNREADABLE_MESSAGE}`);
    }
    if (!this.inlinedFiles.includes(includedPath)) this.inlinedFiles.push(includedPath);
    const content = this.flatten(includedPath, resolution.baseDirectory, [
      ...file.includeChain,
      includedPath,
    ]);
    const body = content === "" || content.endsWith("\n") ? content : `${content}\n`;
    const marked = `% ---- begin ${includedPath}, from ${written} ----\n${body}% ---- end ${includedPath} ----`;
    if (directive.command.includes("include")) return `${lineBreak}\\clearpage{}%\n${marked}\n\\clearpage{}`;
    return `${lineBreak}${marked}${restBlank ? "" : "\n"}`;
  }
}

export function expectedFlattening(project: GeneratedProject): ExpectedFlattening {
  const flattener = new ExpectedFlattener(project);
  const text = flattener.flatten(ROOT_PATH, "", [ROOT_PATH]);
  return {
    text,
    inlinedFiles: flattener.inlinedFiles,
    missingIncludes: flattener.missingIncludes,
    skippedIncludes: flattener.skippedIncludes,
  };
}
