import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { describeCommentThreadsView } from "./reviewViews/commentThreadsView.js";
import { describeTrackedChangesView } from "./reviewViews/trackedChangesView.js";

const REVIEW_VIEWS = ["tracked_changes", "comments"] as const;

const readReviewInput = z.object({
  project: projectArgument,
  view: z
    .enum(REVIEW_VIEWS)
    .describe(
      "What to read: tracked_changes (one document's suggestions, with the ids manage_tracked_changes takes) or comments (comment threads with their messages, with the thread and message ids manage_comments takes).",
    ),
  path: z
    .string()
    .optional()
    .describe(
      "tracked_changes view, required: the document to read, relative to the project root, for example main.tex. comments view: only this document; omit to read every document.",
    ),
  includeResolved: z
    .boolean()
    .optional()
    .describe(
      "comments view only: also list resolved threads (default false, which matches what the review panel shows first).",
    ),
});

type ReadReviewInput = z.infer<typeof readReviewInput>;

export function registerReadReviewTool(server: McpServer, context: ToolContext): void {
  const views: Record<(typeof REVIEW_VIEWS)[number], ToolOperation<ReadReviewInput>> = {
    tracked_changes: {
      uses: ["path"],
      run: async (input) => {
        const path = requireArgument(input.path, "path", "tracked_changes");
        return textResult(await describeTrackedChangesView(context, input.project, path));
      },
    },
    comments: {
      uses: ["path", "includeResolved"],
      run: async (input) =>
        textResult(
          await describeCommentThreadsView(
            context,
            input.project,
            input.path,
            input.includeResolved ?? false,
          ),
        ),
    },
  };

  server.registerTool(
    "read_review",
    {
      title: "Read tracked changes and comments",
      description:
        "Read what is waiting in Overleaf's review panel; view picks what. " +
        "tracked_changes lists the suggestions on one document, which path names, each with its line, its text and the id manage_tracked_changes takes, plus the text each comment thread there is anchored to. " +
        "comments lists comment threads with every message, its id, author and time, the anchored text, and whether the thread is open or resolved, with the thread and message ids manage_comments takes; resolved threads are left out unless includeResolved is true, and without path every document is read, one after another. " +
        "This reads the live editor rather than the Git bridge, so it sees suggestions nobody has accepted yet, which no other tool here can. " +
        "Call it before suggesting, deciding, replying or resolving, to see what is already there. " +
        "A path that is not an editable document fails, and the reply names the documents that exist. " +
        "Returns plain text grouped by document.",
      inputSchema: readReviewInput,
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.view, views, input, ["project", "view"])),
  );
}
