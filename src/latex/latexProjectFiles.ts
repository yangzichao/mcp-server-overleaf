export type LatexFileCategory =
  | "tex"
  | "bibliography"
  | "figure"
  | "class-or-style"
  | "build-artifact"
  | "other";

export interface CategorizedProjectFile {
  readonly path: string;
  readonly category: LatexFileCategory;
}

const CATEGORY_BY_EXTENSION = new Map<string, LatexFileCategory>([
  ["tex", "tex"],
  ["ltx", "tex"],
  ["bib", "bibliography"],
  ["bbl", "bibliography"],
  ["pdf", "figure"],
  ["png", "figure"],
  ["jpg", "figure"],
  ["jpeg", "figure"],
  ["eps", "figure"],
  ["svg", "figure"],
  ["cls", "class-or-style"],
  ["sty", "class-or-style"],
  ["bst", "class-or-style"],
  ["aux", "build-artifact"],
  ["log", "build-artifact"],
  ["out", "build-artifact"],
  ["synctex", "build-artifact"],
  ["fls", "build-artifact"],
  ["fdb_latexmk", "build-artifact"],
]);

export function categorizeProjectFile(filePath: string): LatexFileCategory {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return CATEGORY_BY_EXTENSION.get(extension) ?? "other";
}

export function categorizeProjectFiles(filePaths: readonly string[]): CategorizedProjectFile[] {
  return filePaths.map((path) => ({ path, category: categorizeProjectFile(path) }));
}

/**
 * Picks the file most likely to be the document root, so `compile` works without
 * the caller having to know the project layout.
 */
export function guessMainTexFile(filePaths: readonly string[]): string | null {
  const texFiles = filePaths.filter((path) => categorizeProjectFile(path) === "tex");
  if (texFiles.length === 0) return null;

  const conventionalNames = [
    "main.tex",
    "paper.tex",
    "manuscript.tex",
    "root.tex",
    "thesis.tex",
    "article.tex",
  ];
  for (const name of conventionalNames) {
    const atRoot = texFiles.find((path) => path.toLowerCase() === name);
    if (atRoot) return atRoot;
  }

  const shallowest = [...texFiles].sort(
    (left, right) => left.split("/").length - right.split("/").length || left.length - right.length,
  );
  return shallowest[0] ?? null;
}

/** Confirms a candidate really is a root document rather than an included fragment. */
export function containsDocumentEnvironment(latexSource: string): boolean {
  return /\\begin\s*\{document\}/.test(latexSource);
}
