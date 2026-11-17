import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { EDITS_LOCAL_CLONE_IDEMPOTENTLY } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { revisionArgument } from "./revisionArgument.js";

export function registerRestoreFileTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "restore_file",
    {
      title: "Restore a file from an earlier revision",
      description:
        "Put one file back to exactly what it was at an earlier revision, binary files included; a file deleted since then is brought back. " +
        "The restore is written to the local clone only, replacing the file's current content there; review it with show_diff and publish it with push_changes, or undo it with discard_local_changes. " +
        "Find the revision with list_history, and compare first with show_diff fromRevision. " +
        "Pulls from Overleaf first. Refuses a file that did not exist at that revision.",
      inputSchema: z.object({
        project: projectArgument,
        path: z
          .string()
          .describe("Path of the file to restore, relative to the project root, e.g. sections/intro.tex."),
        revision: revisionArgument.describe(
          "Commit hash to restore the file from, as list_history prints it.",
        ),
      }),
      annotations: EDITS_LOCAL_CLONE_IDEMPOTENTLY,
    },
    async ({ project, path, revision }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);
          const history = repository.history();
          const commit = await history.describeCommit(revision);
          if (!(await history.fileExistedAt(commit.hash, path))) {
            throw new Error(
              `${path} did not exist at revision ${revision}, so there is nothing to restore. To remove the file, use delete_file.`,
            );
          }
          // A text-only checkout keeps binary files off disk, and Git will not restore a path
          // outside the sparse patterns, so the restore needs the full checkout first.
          await repository.materializeAllFiles();
          await repository.restoreFileFromCommit(commit.hash, path);
          return textResult(
            `Restored ${path} to revision ${commit.shortHash} (${commit.date}, ${commit.author}) in the local clone. ` +
              "Review it with show_diff, then call push_changes to publish it to Overleaf.",
          );
        }),
      ),
  );
}
