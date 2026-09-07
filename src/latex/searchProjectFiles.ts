/**
 * Extensions worth searching. Binary figures and PDFs are tracked in Overleaf projects
 * too, and reading them as text would produce noise rather than matches.
 */
const SEARCHABLE_EXTENSION_PATTERN = /\.(tex|ltx|bib|cls|sty|bst|txt|md)$/i;

/**
 * A pathological pattern such as `(a+)+$` backtracks superlinearly in the length of the
 * line it is matched against, and there is no way to time a regex out in-process. Bounding
 * the input keeps a bad pattern from hanging the whole server; LaTeX source does not have
 * meaningful lines this long anyway.
 */
const MAXIMUM_SEARCHED_LINE_LENGTH = 4000;

export interface ProjectSearchMatch {
  readonly path: string;
  readonly lineNumber: number;
  readonly line: string;
}

export interface SearchProjectFilesOptions {
  readonly trackedFiles: readonly string[];
  readonly readTextFile: (path: string) => Promise<string>;
  readonly query: string;
  readonly isRegularExpression: boolean;
  readonly maximumMatches: number;
}

function buildLineMatcher(query: string, isRegularExpression: boolean): (line: string) => boolean {
  if (!isRegularExpression) {
    const lowercaseQuery = query.toLowerCase();
    return (line) => line.toLowerCase().includes(lowercaseQuery);
  }
  const pattern = new RegExp(query, "i");
  return (line) => pattern.test(line.slice(0, MAXIMUM_SEARCHED_LINE_LENGTH));
}

export function isSearchableFile(path: string): boolean {
  return SEARCHABLE_EXTENSION_PATTERN.test(path);
}

export async function searchProjectFiles(options: SearchProjectFilesOptions): Promise<ProjectSearchMatch[]> {
  const matches: ProjectSearchMatch[] = [];
  const lineMatches = buildLineMatcher(options.query, options.isRegularExpression);

  for (const path of options.trackedFiles.filter(isSearchableFile)) {
    if (matches.length >= options.maximumMatches) break;

    const lines = (await options.readTextFile(path)).split("\n");
    for (const [index, line] of lines.entries()) {
      if (matches.length >= options.maximumMatches) break;
      if (lineMatches(line)) matches.push({ path, lineNumber: index + 1, line: line.trim() });
    }
  }

  return matches;
}

export function formatSearchMatches(matches: readonly ProjectSearchMatch[]): string {
  return matches.map((match) => `${match.path}:${match.lineNumber}: ${match.line}`).join("\n");
}
