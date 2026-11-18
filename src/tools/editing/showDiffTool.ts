import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { revisionArgument } from "../history/revisionArgument.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";

export function registerShowDiffTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "show_diff",
    {
      title: "Show pending changes or compare revisions",
      description:
        "Without revisions: a unified diff of everything in one project's clone that Overleaf does not have yet, meaning uncommitted edits, new and deleted files, and commits left behind by a refused push. " +
        "Call it that way before push_changes to see exactly what collaborators will receive, and after a refused push to inspect what is still pending; use project_status when counts are enough. " +
        "With fromRevision: what changed in the project's history between that revision and toRevision, or Overleaf's latest fetched version when toRevision is omitted; take revisions from list_history. " +
        "path narrows either kind to one file or directory. " +
        "It does not pull first, so the comparison is against Overleaf as last fetched; it contacts Overleaf only to clone a project not opened before. " +
        'The diff is cut off after 60,000 characters. "No local changes pending." means there is nothing to push.',
      inputSchema: z.object({
        project: projectArgument,
        fromRevision: revisionArgument
          .optional()
          .describe("Compare history from this commit hash instead of showing pending local changes."),
        toRevision: revisionArgument
          .optional()
          .describe(
            "End of the comparison. Requires fromRevision; omitted, Overleaf's latest fetched version.",
          ),
        path: z
          .string()
          .optional()
          .describe("Only this file or directory, relative to the project root. Omit for the whole project."),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, fromRevision, toRevision, path }) =>
      runToolSafely(context, () => {
        if (toRevision && !fromRevision) throw new Error("toRevision needs fromRevision as well.");
        return context.projectRegistry.withRepository(project, async (repository) => {
          if (fromRevision) {
            const diff = await repository.history().diff(fromRevision, toRevision, path);
            const range = `${fromRevision}..${toRevision ?? "Overleaf's latest version"}`;
            return textResult(
              diff.trim() === ""
                ? `No differences in ${path ?? "the project"} for ${range}.`
                : truncateForModel(diff),
            );
          }
          const diff = await repository.getPendingDiff(path);
          return textResult(diff.trim() === "" ? "No local changes pending." : truncateForModel(diff));
        });
      }),
  );
}
