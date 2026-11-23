import * as z from "zod/v4";

import { formatSearchMatches, type ProjectSearchMatch } from "../../latex/searchProjectFiles.js";
import { projectArgument } from "../projectArgument.js";
import { truncateForModel } from "../toolContext.js";

/** The arguments and the shared words of search_project, which has a clone and an editor version. */
export const searchProjectInput = z.object({
  project: projectArgument,
  query: z
    .string()
    .describe(
      "What to look for. Literal text by default, so LaTeX backslashes need no escaping; a regular expression when isRegularExpression is true.",
    ),
  isRegularExpression: z
    .boolean()
    .optional()
    .describe("Treat query as a regular expression instead of literal text (default false)."),
  maximumMatches: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe("Stop after this many matches, between 1 and 500 (default 100)."),
});

export const SEARCH_PROJECT_TITLE = "Search the project";

export const SEARCH_PROJECT_PURPOSE =
  "Search the project's text sources for a literal string or a regular expression, returning matching lines as path:line: text. " +
  "Use it to find where a term, citation key, label or command appears when you do not know which file holds it; once you do, use read_file, with sectionTitle for one section, and use read_project (view files) to find a file by name. ";

export const SEARCH_PROJECT_MATCHING =
  "Both modes are case-insensitive and match one line at a time, so a pattern cannot span lines. " +
  "A regular expression uses JavaScript syntax, sees the first 4,000 characters of each line, and is abandoned with an error after 10 seconds; an invalid one fails with its syntax error. " +
  "maximumMatches counts matching lines, taken in path order.";

export function describeSearchMatches(query: string, matches: readonly ProjectSearchMatch[]): string {
  return matches.length === 0 ? `No matches for "${query}".` : truncateForModel(formatSearchMatches(matches));
}
