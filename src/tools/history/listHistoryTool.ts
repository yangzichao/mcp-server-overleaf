import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { describeCommitHistory } from "./describeCommitHistory.js";
import { historyDateArgument, toGitHistoryBoundary } from "./historyDateArgument.js";

export function registerListHistoryTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_history",
    {
      title: "List the project's history",
      description:
        "List the commits in a project's history, newest first, with date, author, message and the files each one changed: the history Overleaf's Git bridge has recorded, plus anything pushed from here. " +
        "Use it to find out who changed a file and when, or to find a revision for show_diff, read_file or restore_file, which take the short hash it prints. " +
        "Pulls from Overleaf first, so the newest commits are included. " +
        "Returns at most limit commits; narrow with path, since and until rather than raising limit far.",
      inputSchema: z.object({
        project: projectArgument,
        path: z
          .string()
          .optional()
          .describe(
            "Only commits that changed this file or directory, relative to the project root. Omit for the whole project.",
          ),
        since: historyDateArgument
          .optional()
          .describe("Only commits on or after this date, for example 2026-11-01 or 2 weeks ago."),
        until: historyDateArgument
          .optional()
          .describe("Only commits on or before this date, in the same forms as since."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(20)
          .describe("Most commits to return, 1 to 200. Defaults to 20."),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, path, since, until, limit }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);
          const commits = await repository.history().listCommits({
            path,
            since: since && toGitHistoryBoundary(since, "since"),
            until: until && toGitHistoryBoundary(until, "until"),
            limit,
          });
          return textResult(truncateForModel(describeCommitHistory(commits, path ?? "the project", limit)));
        }),
      ),
  );
}
