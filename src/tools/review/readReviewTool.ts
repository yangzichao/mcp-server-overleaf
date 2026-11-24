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
        "Read what is waiting in Overleaf's review panel. It reads the live editor rather than the Git bridge, so it sees suggestions nobody has accepted yet, which no other tool here can. " +
        "Call it before suggesting, deciding, replying or resolving, to see what is already there. " +
        "tracked_changes lists one document's suggestions, each with its line, its text and its id, plus the text each comment thread in that document is anchored to. " +
        "comments lists threads under their documents, in the order their anchors appear, each with its line, the anchored text, whether it is open or resolved, and every message with its id, author and time. " +
        "path must name one of the project's editable documents, as read_project (view files) lists them. Any other path is refused, and the reply names the documents that exist. " +
        "Leaving out path in the comments view also counts threads whose anchored text was deleted, which reading one document cannot find. When includeResolved is false, a note counts the resolved threads left out. " +
        "An argument the chosen view does not take, such as includeResolved with tracked_changes, is refused. " +
        "Returns plain text grouped by document, cut off after 60,000 characters.",
      inputSchema: readReviewInput,
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.view, views, input, ["project", "view"])),
  );
}
