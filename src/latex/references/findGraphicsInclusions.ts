import type { VisitedSourceFile } from "../includes/walkIncludedFiles.js";
import { directoryOf, findFirstExistingPath } from "../source/projectPaths.js";
import { locationOf, type SourceLocation } from "../source/scannedSource.js";

/**
 * Figures and inserted PDFs, and where graphicx will look for them: the directories
 * \graphicspath lists, then the project root.
 */

export interface GraphicsInclusion {
  readonly command: string;
  readonly fileName: string;
  /** The command as it appears in the source, without its options. */
  readonly written: string;
  readonly location: SourceLocation;
  readonly searchDirectories: readonly string[];
}

/** graphicx's default extension list for pdfLaTeX, in its own order, plus .eps that epstopdf converts. */
const GRAPHICS_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".mps",
  ".jpeg",
  ".jbig2",
  ".jb2",
  ".PDF",
  ".PNG",
  ".JPG",
  ".JPEG",
  ".JBIG2",
  ".JB2",
  ".eps",
];
const EXTENSIONS_BY_COMMAND: Record<string, readonly string[]> = {
  includegraphics: GRAPHICS_EXTENSIONS,
  includesvg: [".svg"],
  includepdf: [".pdf"],
};

const GRAPHICS_PATTERN = /\\(includegraphics|includesvg|includepdf)\*?\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g;
const GRAPHICSPATH_PATTERN = /\\graphicspath\s*\{((?:\s*\{[^{}]*\})*)\s*\}/g;

export function findGraphicsPaths(file: VisitedSourceFile): string[] {
  return [...file.text.matchAll(GRAPHICSPATH_PATTERN)].flatMap((match) =>
    [...(match[1] ?? "").matchAll(/\{([^{}]*)\}/g)].map((directory) => (directory[1] ?? "").trim()),
  );
}

export function findGraphicsInclusions(
  file: VisitedSourceFile,
  graphicsPaths: readonly string[],
): { inclusions: GraphicsInclusion[]; pathsBuiltFromMacros: number } {
  const inclusions: GraphicsInclusion[] = [];
  let pathsBuiltFromMacros = 0;
  for (const match of file.text.matchAll(GRAPHICS_PATTERN)) {
    const command = match[1] ?? "includegraphics";
    const fileName = (match[2] ?? "").trim().replace(/^"(.*)"$/, "$1");
    if (fileName === "") continue;
    if (fileName.includes("\\") || fileName.includes("#")) {
      pathsBuiltFromMacros += 1;
      continue;
    }
    inclusions.push({
      command,
      fileName,
      written: `\\${command}{${fileName}}`,
      location: locationOf(file, match.index),
      searchDirectories: [file.baseDirectory, ...graphicsPaths, "", directoryOf(file.path)],
    });
  }
  return { inclusions, pathsBuiltFromMacros };
}

export function resolveGraphicsInclusion(
  inclusion: GraphicsInclusion,
  projectFiles: ReadonlySet<string>,
): { found: string } | { tried: string[] } {
  const extensions = EXTENSIONS_BY_COMMAND[inclusion.command] ?? GRAPHICS_EXTENSIONS;
  const dot = inclusion.fileName.lastIndexOf(".");
  const writtenExtension = dot > inclusion.fileName.lastIndexOf("/") ? inclusion.fileName.slice(dot) : "";
  const hasKnownExtension = extensions.some(
    (extension) => extension.toLowerCase() === writtenExtension.toLowerCase(),
  );
  const fileNames = hasKnownExtension
    ? [inclusion.fileName]
    : extensions.map((extension) => `${inclusion.fileName}${extension}`);
  return findFirstExistingPath(inclusion.searchDirectories, fileNames, projectFiles);
}
