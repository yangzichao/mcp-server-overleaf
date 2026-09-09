import {
  REGULAR_EXPRESSION_BUDGET_MS,
  type SearchableDocument,
  searchDocumentsWithBoundedRegex,
} from "./boundedRegexSearch.js";

/**
 * Extensions worth searching. Binary figures and PDFs are tracked in Overleaf projects
 * too, and reading them as text would produce noise rather than matches.
 */
const SEARCHABLE_EXTENSION_PATTERN = /\.(tex|ltx|bib|cls|sty|bst|txt|md)$/i;

/**
 * Where a line stops being searched by a regular expression.
 *
 * This is a limit on wasted work, not a safety guard: exponential backtracking grows per
 * character, so no line length worth searching would bound it. What bounds it is the
 * deadline in boundedRegexSearch. LaTeX source does not have meaningful lines this long.
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
  /** Overridable only so tests need not wait out the real budget. */
  readonly regularExpressionBudgetMs?: number;
}

export function isSearchableFile(path: string): boolean {
  return SEARCHABLE_EXTENSION_PATTERN.test(path);
}

/** Reads only as far as the match cap requires, which is the common case. */
async function searchForSubstring(
  options: SearchProjectFilesOptions,
  searchableFiles: readonly string[],
): Promise<ProjectSearchMatch[]> {
  const matches: ProjectSearchMatch[] = [];
  const lowercaseQuery = options.query.toLowerCase();

  for (const path of searchableFiles) {
    if (matches.length >= options.maximumMatches) break;

    const lines = (await options.readTextFile(path)).split("\n");
    for (const [index, line] of lines.entries()) {
      if (matches.length >= options.maximumMatches) break;
      if (line.toLowerCase().includes(lowercaseQuery)) {
        matches.push({ path, lineNumber: index + 1, line: line.trim() });
      }
    }
  }

  return matches;
}

/**
 * Reads every searchable file before matching, because the matching happens on another
 * thread and the file contents have to be handed over in one piece. These are LaTeX
 * sources, so the extra reads cost far less than the thread they are handed to.
 */
async function searchForRegularExpression(
  options: SearchProjectFilesOptions,
  searchableFiles: readonly string[],
): Promise<ProjectSearchMatch[]> {
  const documents: SearchableDocument[] = [];
  for (const path of searchableFiles) {
    documents.push({ path, lines: (await options.readTextFile(path)).split("\n") });
  }

  return await searchDocumentsWithBoundedRegex({
    pattern: options.query,
    documents,
    maximumMatches: options.maximumMatches,
    maximumLineLength: MAXIMUM_SEARCHED_LINE_LENGTH,
    budgetMs: options.regularExpressionBudgetMs ?? REGULAR_EXPRESSION_BUDGET_MS,
  });
}

export async function searchProjectFiles(options: SearchProjectFilesOptions): Promise<ProjectSearchMatch[]> {
  const searchableFiles = options.trackedFiles.filter(isSearchableFile);
  return options.isRegularExpression
    ? await searchForRegularExpression(options, searchableFiles)
    : await searchForSubstring(options, searchableFiles);
}

export function formatSearchMatches(matches: readonly ProjectSearchMatch[]): string {
  return matches.map((match) => `${match.path}:${match.lineNumber}: ${match.line}`).join("\n");
}
