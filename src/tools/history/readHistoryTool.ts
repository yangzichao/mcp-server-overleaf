import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { endLineArgument, startLineArgument } from "../reading/readFileArguments.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { historyDateArgument } from "./historyDateArgument.js";
import { describeBlameView } from "./historyViews/blameView.js";
import { DEFAULT_COMMIT_LIMIT, describeCommitHistoryView } from "./historyViews/commitHistoryView.js";
import { describeRevisionDiff } from "./historyViews/revisionDiffView.js";
import { revisionArgument } from "./revisionArgument.js";

const HISTORY_VIEWS = ["commits", "diff", "blame"] as const;

const readHistoryInput = z.object({
  project: projectArgument,
  view: z
    .enum(HISTORY_VIEWS)
    .default("commits")
    .describe(
      'What to read (default "commits"): commits (the log, newest first), diff (what changed between two revisions) or blame (who last changed each line of one file).',
    ),
  path: z
    .string()
    .optional()
    .describe(
      "commits and diff: only this file or directory, relative to the project root; omit for the whole project. blame, required: the file to blame.",
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
  startLine: startLineArgument.describe(
    "blame view only: first line to blame, 1-indexed. Omit to start at line 1.",
  ),
  endLine: endLineArgument.describe(
    "blame view only: last line to blame, inclusive. Omit to blame to the end; a value past the end stops there.",
  ),
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
    blame: {
      uses: ["path", "startLine", "endLine"],
      run: (input) => {
        const path = requireArgument(input.path, "path", "blame");
        return context.projectRegistry.withRepository(input.project, async (repository) =>
          textResult(
            await describeBlameView(repository, { path, startLine: input.startLine, endLine: input.endLine }),
          ),
        );
      },
    },
  };

  server.registerTool(
    "read_history",
    {
      title: "Read the project's history",
      description:
        "Read the history Overleaf's Git bridge has recorded for a project, plus anything pushed from here. " +
        "commits, the default view, lists commits newest first, with date, author, message and the files each one changed. Use it to find who changed a file and when, or a revision for read_file, manage_files (action restore) or the diff view, which take the short hash it prints. It returns at most limit commits, so narrow with path, since and until rather than raising limit far. " +
        "diff shows what changed from fromRevision to toRevision, or to Overleaf's latest fetched version without toRevision. For local edits not yet pushed, use read_project (view changes) instead. " +
        'blame prints each line of the file at path, or of startLine to endLine, after the short hash, date and author of the commit that last changed it, then lists those commits with their messages. A line edited here and not committed yet is marked "not committed yet". Blame follows the file through renames, and refuses a binary file or one with no commit yet. ' +
        "commits and blame first pull from Overleaf over the network, so the newest commits are included. That pull can fail when Overleaf has new commits and local work is not pushed yet. The call is then refused, the local work kept, and the reply says how to review, push or discard it. diff does not pull, and compares against Overleaf as last fetched. " +
        "A diff without fromRevision, a blame without path, or a revision that is not a commit hash is refused before Git runs. A diff or blame is cut off after 60,000 characters, so blame a long file in line ranges.",
      inputSchema: readHistoryInput,
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.view, views, input, ["project", "view"])),
  );
}
