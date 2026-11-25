import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireArgument, runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { addCommentAction } from "./commentActions/addCommentAction.js";
import { deleteCommentMessageAction } from "./commentActions/deleteCommentMessageAction.js";
import { deleteCommentThreadAction } from "./commentActions/deleteCommentThreadAction.js";
import { editCommentMessageAction } from "./commentActions/editCommentMessageAction.js";
import { replyToCommentAction } from "./commentActions/replyToCommentAction.js";
import { setCommentThreadStateAction } from "./commentActions/setCommentThreadStateAction.js";

const COMMENT_ACTIONS = [
  "add",
  "reply",
  "resolve",
  "reopen",
  "delete",
  "edit_message",
  "delete_message",
] as const;

const manageCommentsInput = z.object({
  project: projectArgument,
  action: z.enum(COMMENT_ACTIONS).describe("What to do. The tool description explains each action."),
  path: z
    .string()
    .optional()
    .describe(
      "add, required: the document to comment in, relative to the project root, for example main.tex. resolve, reopen and delete, optional: the document the thread is anchored in; without it every document is searched, which takes one read per document.",
    ),
  quoteText: z.string().min(1).optional().describe("add, required: the passage the comment is anchored to."),
  message: z
    .string()
    .min(1)
    .optional()
    .describe(
      "add, reply and edit_message, required: the comment, the reply, or a message's new text, as it should appear in the review panel.",
    ),
  threadId: z
    .string()
    .regex(/^[0-9a-f]{24}$/, "A thread id is 24 hexadecimal characters.")
    .optional()
    .describe(
      "reply, resolve, reopen, delete, edit_message and delete_message, required: id of the comment thread, as read_review shows it in [thread …].",
    ),
  messageId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, "A message id is letters, digits, - and _ only.")
    .optional()
    .describe(
      "edit_message and delete_message, required: id of the message within threadId, as read_review (view comments) shows it in [message …].",
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
    edit_message: {
      uses: ["threadId", "messageId", "message"],
      run: (input) =>
        editCommentMessageAction(context, input.project, {
          threadId: requireArgument(input.threadId, "threadId", "edit_message"),
          messageId: requireArgument(input.messageId, "messageId", "edit_message"),
          content: requireArgument(input.message, "message", "edit_message"),
        }),
    },
    delete_message: {
      uses: ["threadId", "messageId"],
      run: (input) =>
        deleteCommentMessageAction(context, input.project, {
          threadId: requireArgument(input.threadId, "threadId", "delete_message"),
          messageId: requireArgument(input.messageId, "messageId", "delete_message"),
        }),
    },
  };

  server.registerTool(
    "manage_comments",
    {
      title: "Add, answer, edit, resolve or delete comments",
      description:
        "Change the comment threads in Overleaf's review panel. Every action takes effect in Overleaf at once, with no push step, and messages appear under the signed-in account's name, so confirm with the user first. " +
        "add starts a thread on a passage, to raise a question without changing the prose. quoteText is compared literally with the document as the editor holds it now, and must occur exactly once in the document at path. When it is missing or repeated, nothing is added. " +
        "reply adds a message without resolving the thread. resolve and reopen change only the thread's status, keeping the thread and its messages. " +
        "delete removes a thread, its anchor and every message for everyone, and cannot be undone from here, so prefer resolve unless the thread should not exist at all. " +
        "edit_message replaces the text of one message. Overleaf's editor offers that only on the account's own messages, and sending the text the message already has changes nothing. " +
        "delete_message removes one reply. With review access only the account's own replies can go. A thread's first message is refused, because only delete removes it, with the whole thread. " +
        "edit_message and delete_message read the thread again and fail if the change is not there. " +
        "An unknown threadId is refused rather than starting a new thread, and an unknown messageId is refused with the ids the thread has. An argument the chosen action does not take is refused before anything is sent. " +
        "Returns the new thread id for add, otherwise a one-line confirmation.",
      inputSchema: manageCommentsInput,
      annotations: WRITES_TO_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.action, actions, input, ["project", "action"])),
  );
}
