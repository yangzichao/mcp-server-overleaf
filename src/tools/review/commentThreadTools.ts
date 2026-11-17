import { randomBytes } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  deleteCommentThread,
  fetchCommentThreads,
  postCommentMessage,
  setCommentThreadResolved,
} from "../../overleaf/web/commentThreads.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF, SUGGESTS_IN_OVERLEAF, WRITES_TO_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { describeCommentListing } from "./describeCommentThreads.js";
import { findTextOffset } from "./describeTrackedChanges.js";
import { collectCommentAnchors, locateCommentThread } from "./locateCommentThreads.js";
import { requireDocument, requireWebClient, withReviewSession } from "./openReviewSession.js";

/**
 * Review-panel comment threads: anchoring one, reading them, replying, resolving and deleting.
 *
 * A thread has two halves that live in different places. The anchor is a range in the document,
 * set with an editor operation like any other edit. The messages live in Overleaf's chat service
 * and go over the web application. Each tool here touches whichever halves it needs, in the
 * order the web editor does.
 */

const pathArgument = z
  .string()
  .describe("Path of the document relative to the project root, for example main.tex.");

const threadIdArgument = z
  .string()
  .regex(/^[0-9a-f]{24}$/, "A thread id is 24 hexadecimal characters.")
  .describe("Id of the comment thread, as list_comments or list_tracked_changes shows it in [thread …].");

const optionalPathArgument = pathArgument
  .optional()
  .describe(
    "Document the thread is anchored in. Optional: without it every document is searched, which takes one read per document.",
  );

/** Overleaf's own thread ids are 24 hexadecimal characters, the shape of a Mongo ObjectId. */
function newThreadId(): string {
  return randomBytes(12).toString("hex");
}

export function registerCommentThreadTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_comments",
    {
      title: "List comment threads with their messages",
      description:
        "Read the review-panel comment threads in a project: which text each one is anchored to, whether it is open or resolved, and every message in it with author and time. " +
        "Call it before replying to or resolving a comment, to see what was actually said. " +
        "Resolved threads are left out unless includeResolved is true. " +
        "Without a path every document is read, one after another. " +
        "Returns plain text grouped by document; thread ids in [thread …] are what reply_to_comment, resolve_comment and delete_comment take.",
      inputSchema: z.object({
        project: projectArgument,
        path: pathArgument
          .optional()
          .describe("Only this document. Omit to read every document in the project."),
        includeResolved: z
          .boolean()
          .default(false)
          .describe(
            "Also list resolved threads. Defaults to false, which matches what the review panel shows first.",
          ),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, path, includeResolved }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, async (session) => {
          const webClient = requireWebClient(context);
          const threads = await fetchCommentThreads(webClient, session.project.projectId);
          const anchored = await collectCommentAnchors(session, path);
          return textResult(
            truncateForModel(
              describeCommentListing({ anchored, threads, includeResolved, coveredWholeProject: !path }),
            ),
          );
        }),
      ),
  );

  server.registerTool(
    "add_comment",
    {
      title: "Comment on a passage",
      description:
        "Start a review-panel comment thread on an exact snippet of text, with a first message, for raising a question without changing the prose. " +
        "Takes effect in Overleaf immediately; there is no separate push. " +
        "The snippet must match exactly and occur exactly once in the document. " +
        "Returns the new thread id, which reply_to_comment and resolve_comment take.",
      inputSchema: z.object({
        project: projectArgument,
        path: pathArgument,
        quoteText: z
          .string()
          .min(1)
          .describe(
            "Exact text the comment should be anchored to, matched literally. Must occur exactly once in the document.",
          ),
        message: z
          .string()
          .min(1)
          .describe("The comment itself, as it should appear in the review panel under your account's name."),
      }),
      annotations: SUGGESTS_IN_OVERLEAF,
    },
    async ({ project, path, quoteText, message }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, async (session) => {
          const webClient = requireWebClient(context);
          const document = requireDocument(session, path);
          const joined = await session.joinDocument(document.documentId);
          const position = findTextOffset(joined.lines, quoteText, "unique");
          const threadId = newThreadId();

          // The web editor posts the message first and anchors it second, so a thread is never
          // visible in the document without its text. If anchoring then fails, the message is
          // removed again rather than left behind with nothing to hang on.
          await postCommentMessage(webClient, session.project.projectId, threadId, message);
          try {
            await session.applyOperations(document.documentId, joined.version, [
              { p: position, c: quoteText, t: threadId },
            ]);
          } catch (error) {
            await deleteCommentThread(
              webClient,
              session.project.projectId,
              document.documentId,
              threadId,
            ).catch(() => undefined);
            throw error;
          }
          return textResult(`Commented on "${quoteText}" in ${document.path} (thread ${threadId}).`);
        }),
      ),
  );

  server.registerTool(
    "reply_to_comment",
    {
      title: "Reply to a comment thread",
      description:
        "Add a message to an existing review-panel comment thread, under your account's name. " +
        "Takes effect in Overleaf immediately. It does not change the paper and does not resolve the thread; use resolve_comment for that. " +
        "Returns a one-line confirmation.",
      inputSchema: z.object({
        project: projectArgument,
        threadId: threadIdArgument,
        message: z.string().min(1).describe("The reply, as it should appear in the thread."),
      }),
      annotations: SUGGESTS_IN_OVERLEAF,
    },
    async ({ project, threadId, message }) =>
      runToolSafely(context, async () => {
        const webClient = requireWebClient(context);
        const { overleafProjectId } = context.projectRegistry.resolveProjectId(project);
        // Overleaf creates a thread for any id it is sent a message for. Checking first keeps a
        // mistyped id from becoming a new thread that no text in the paper points to.
        const threads = await fetchCommentThreads(webClient, overleafProjectId);
        if (!threads.has(threadId)) {
          throw new Error(
            `No comment thread ${threadId} in this project. list_comments shows the thread ids that exist.`,
          );
        }
        await postCommentMessage(webClient, overleafProjectId, threadId, message);
        return textResult(`Replied in thread ${threadId}.`);
      }),
  );

  server.registerTool(
    "resolve_comment",
    {
      title: "Resolve or reopen a comment thread",
      description:
        "Mark a review-panel comment thread as resolved, or reopen a resolved one with reopen: true. " +
        "Takes effect in Overleaf immediately. The thread and its messages are kept either way; use delete_comment to remove one. " +
        "Returns a one-line confirmation.",
      inputSchema: z.object({
        project: projectArgument,
        threadId: threadIdArgument,
        reopen: z
          .boolean()
          .default(false)
          .describe("Reopen a resolved thread instead of resolving an open one."),
        path: optionalPathArgument,
      }),
      annotations: SUGGESTS_IN_OVERLEAF,
    },
    async ({ project, threadId, reopen, path }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, async (session) => {
          const webClient = requireWebClient(context);
          const located = await locateCommentThread(session, threadId, path);
          await setCommentThreadResolved(
            webClient,
            session.project.projectId,
            located.document.documentId,
            threadId,
            !reopen,
          );
          return textResult(
            `${reopen ? "Reopened" : "Resolved"} thread ${threadId} on "${located.anchor.quotedText}" in ${located.document.path}.`,
          );
        }),
      ),
  );

  server.registerTool(
    "delete_comment",
    {
      title: "Delete a comment thread",
      description:
        "Delete a review-panel comment thread for everyone: its anchor in the document and every message in it. " +
        "This cannot be undone from here. Prefer resolve_comment, which keeps the discussion, unless the thread should not exist at all. " +
        "Returns a one-line confirmation.",
      inputSchema: z.object({
        project: projectArgument,
        threadId: threadIdArgument,
        path: optionalPathArgument,
      }),
      annotations: WRITES_TO_OVERLEAF,
    },
    async ({ project, threadId, path }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, async (session) => {
          const webClient = requireWebClient(context);
          const located = await locateCommentThread(session, threadId, path);
          await deleteCommentThread(
            webClient,
            session.project.projectId,
            located.document.documentId,
            threadId,
          );
          return textResult(
            `Deleted thread ${threadId} on "${located.anchor.quotedText}" in ${located.document.path}, with all its messages.`,
          );
        }),
      ),
  );
}
