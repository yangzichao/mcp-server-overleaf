import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { historyDateArgument } from "./historyDateArgument.js";
import { DEFAULT_COMMIT_LIMIT, describeCommitHistoryView } from "./historyViews/commitHistoryView.js";
import { describeRevisionDiff } from "./historyViews/revisionDiffView.js";
import { revisionArgument } from "./revisionArgument.js";

const HISTORY_VIEWS = ["commits", "diff"] as const;

const readHistoryInput = z.object({
  project: projectArgument,
  view: z
    .enum(HISTORY_VIEWS)
    .default("commits")
    .describe(
      'What to read (default "commits"): commits (the log, newest first) or diff (what changed between two revisions).',
    ),
  path: z
    .string()
    .optional()
    .describe(
      "Both views: only this file or directory, relative to the project root. Omit for the whole project.",
    ),
  since: historyDateArgument
    .optional()
    .describe("commits view only: commits on or after this date, for example 2026-11-01 or 2 weeks ago."),
  until: historyDateArgument
    .optional()
    .describe("commits view only: commits on or before this date, in the same forms as since."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe(`commits view only: most commits to return, 1 to 200 (default ${DEFAULT_COMMIT_LIMIT}).`),
  fromRevision: revisionArgument
    .optional()
    .describe("diff view, required: the commit hash to compare from, as the commits view prints it."),
  toRevision: revisionArgument
    .optional()
    .describe("diff view only: the commit hash to compare to. Omit for Overleaf's latest fetched version."),
});

type ReadHistoryInput = z.infer<typeof readHistoryInput>;

export function registerReadHistoryTool(server: McpServer, context: ToolContext): void {
  const views: Record<(typeof HISTORY_VIEWS)[number], ToolOperation<ReadHistoryInput>> = {
    commits: {
      uses: ["path", "since", "until", "limit"],
      run: (input) =>
        context.projectRegistry.withRepository(input.project, async (repository) =>
          textResult(
            await describeCommitHistoryView(repository, {
              path: input.path,
              since: input.since,
              until: input.until,
              limit: input.limit ?? DEFAULT_COMMIT_LIMIT,
            }),
          ),
        ),
    },
    diff: {
      uses: ["fromRevision", "toRevision", "path"],
      run: (input) => {
        const fromRevision = requireArgument(input.fromRevision, "fromRevision", "diff");
        return context.projectRegistry.withRepository(input.project, async (repository) =>
          textResult(await describeRevisionDiff(repository, fromRevision, input.toRevision, input.path)),
        );
      },
    },
  };

  server.registerTool(
    "read_history",
    {
      title: "Read the project's history",
      description:
        "Read the history Overleaf's Git bridge has recorded for a project, plus anything pushed from here; view picks what. " +
        "commits, the default, lists commits newest first, with date, author, message and the files each one changed. Use it to find out who changed a file and when, or to find a revision for read_file, manage_files (action restore) or the diff view, which take the short hash it prints. " +
        "diff shows what changed from fromRevision to toRevision, or to Overleaf's latest fetched version when toRevision is omitted; read_project (view changes) shows local edits not yet pushed instead. " +
        "path narrows either view to one file or directory. " +
        "commits pulls from Overleaf first, so the newest commits are included, and fails, keeping local work, if that pull conflicts with it; diff does not pull and compares against Overleaf as last fetched. " +
        "A diff missing fromRevision, or a revision that is not a commit hash, is refused before Git runs. " +
        "Returns at most limit commits, so narrow with path, since and until rather than raising limit far; a diff is cut off after 60,000 characters.",
      inputSchema: readHistoryInput,
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.view, views, input, ["project", "view"])),
  );
}
