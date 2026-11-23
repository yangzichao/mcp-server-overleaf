import type { McpServer } from "@modelcontextprotocol/server";

import { searchProjectFiles } from "../../latex/searchProjectFiles.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import {
  describeSearchMatches,
  SEARCH_PROJECT_MATCHING,
  SEARCH_PROJECT_PURPOSE,
  SEARCH_PROJECT_TITLE,
  searchProjectInput,
} from "./searchProjectArguments.js";

export function registerSearchProjectTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "search_project",
    {
      title: SEARCH_PROJECT_TITLE,
      description:
        SEARCH_PROJECT_PURPOSE +
        "Only .tex, .ltx, .bib, .cls, .sty, .bst, .txt and .md files are searched, and a file created locally is not searched until push_changes commits it. " +
        `${SEARCH_PROJECT_MATCHING} Pulls from Overleaf first.`,
      inputSchema: searchProjectInput,
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

          return textResult(describeSearchMatches(query, matches));
        }),
      ),
  );
}
