import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { addCommentAction } from "./commentActions/addCommentAction.js";
import { deleteCommentThreadAction } from "./commentActions/deleteCommentThreadAction.js";
import { replyToCommentAction } from "./commentActions/replyToCommentAction.js";
import { setCommentThreadStateAction } from "./commentActions/setCommentThreadStateAction.js";

const COMMENT_ACTIONS = ["add", "reply", "resolve", "reopen", "delete"] as const;

const manageCommentsInput = z.object({
  project: projectArgument,
  action: z
    .enum(COMMENT_ACTIONS)
    .describe("What to do: add (start a thread), reply, resolve, reopen, or delete (a thread, permanently)."),
  path: z
    .string()
    .optional()
    .describe(
      "add, required: the document to comment in, relative to the project root, for example main.tex. resolve, reopen and delete, optional: the document the thread is anchored in; without it every document is searched, which takes one read per document.",
    ),
  quoteText: z
    .string()
    .min(1)
    .optional()
    .describe(
      "add, required: exact text the comment is anchored to, matched literally. Must occur exactly once in the document.",
    ),
  message: z
    .string()
    .min(1)
    .optional()
    .describe(
      "add and reply, required: the comment or reply, as it should appear in the review panel under the account's name.",
    ),
  threadId: z
    .string()
    .regex(/^[0-9a-f]{24}$/, "A thread id is 24 hexadecimal characters.")
    .optional()
    .describe(
      "reply, resolve, reopen and delete, required: id of the comment thread, as read_review shows it in [thread …].",
    ),
});

type ManageCommentsInput = z.infer<typeof manageCommentsInput>;

export function registerManageCommentsTool(server: McpServer, context: ToolContext): void {
  const setState = (action: "resolve" | "reopen"): ToolOperation<ManageCommentsInput> => ({
    uses: ["threadId", "path"],
    run: (input) =>
      setCommentThreadStateAction(context, input.project, {
        threadId: requireArgument(input.threadId, "threadId", action),
        path: input.path,
        resolved: action === "resolve",
      }),
  });
  const actions: Record<(typeof COMMENT_ACTIONS)[number], ToolOperation<ManageCommentsInput>> = {
    add: {
      uses: ["path", "quoteText", "message"],
      run: (input) =>
        addCommentAction(context, {
          project: input.project,
          path: requireArgument(input.path, "path", "add"),
          quoteText: requireArgument(input.quoteText, "quoteText", "add"),
          message: requireArgument(input.message, "message", "add"),
        }),
    },
    reply: {
      uses: ["threadId", "message"],
      run: (input) =>
        replyToCommentAction(
          context,
          input.project,
          requireArgument(input.threadId, "threadId", "reply"),
          requireArgument(input.message, "message", "reply"),
        ),
    },
    resolve: setState("resolve"),
    reopen: setState("reopen"),
    delete: {
      uses: ["threadId", "path"],
      run: (input) =>
        deleteCommentThreadAction(
          context,
          input.project,
          requireArgument(input.threadId, "threadId", "delete"),
          input.path,
        ),
    },
  };

  server.registerTool(
    "manage_comments",
    {
      title: "Add, answer, resolve or delete comments",
      description:
        "Change the comment threads in Overleaf's review panel; action picks what. " +
        "add starts a thread on an exact snippet, quoteText, with a first message, for raising a question without changing the prose; the snippet must occur exactly once in the document path names. " +
        "reply adds a message to a thread without resolving it. resolve marks a thread resolved and reopen opens a resolved one again, keeping the thread and its messages either way. " +
        "delete removes a thread for everyone, its anchor and every message in it, and cannot be undone from here, so prefer resolve unless the thread should not exist at all. " +
        "Thread ids come from read_review (view comments); a thread id that does not exist is refused, so a typo never starts a new thread. path saves searching every document when resolving, reopening or deleting. " +
        "Messages appear under the signed-in account's name, and every action takes effect in Overleaf immediately, with no push step, so confirm with the user first. " +
        "Returns the new thread id for add, otherwise a one-line confirmation.",
      inputSchema: manageCommentsInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.action, actions, input, ["project", "action"])),
  );
}
