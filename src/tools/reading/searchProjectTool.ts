import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { formatSearchMatches, searchProjectFiles } from "../../latex/searchProjectFiles.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";

export function registerSearchProjectTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "search_project",
    {
      title: "Search the project",
      description:
        "Search the project's text sources for a literal string or a regular expression, returning matching lines as path:line: text. " +
        "Use it to find where a term, citation key, label or command appears when you do not know which file holds it; once you do, use read_file, with sectionTitle for one section, and use read_project (view files) to find a file by name. " +
        "Only .tex, .ltx, .bib, .cls, .sty, .bst, .txt and .md files are searched, and a file created locally is not searched until push_changes commits it. " +
        "Both modes are case-insensitive and match one line at a time, so a pattern cannot span lines. " +
        "A regular expression uses JavaScript syntax, sees the first 4,000 characters of each line, and is abandoned with an error after 10 seconds; an invalid one fails with its syntax error. " +
        "maximumMatches counts matching lines, taken in path order. Pulls from Overleaf first.",
      inputSchema: z.object({
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
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, query, isRegularExpression, maximumMatches }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);

          const matches = await searchProjectFiles({
            trackedFiles: await repository.listTrackedFiles(),
            readTextFile: (path) => repository.readTextFile(path),
            query,
            isRegularExpression: isRegularExpression ?? false,
            maximumMatches: maximumMatches ?? 100,
          });

          return textResult(
            matches.length === 0
              ? `No matches for "${query}".`
              : truncateForModel(formatSearchMatches(matches)),
          );
        }),
      ),
  );
}
