import { randomBytes } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  type DocumentOperation,
  generateTrackedChangeIdSeed,
} from "../../overleaf/realtime/overleafRealtimeSession.js";
import { projectArgument } from "../projectArgument.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { describeDocumentRanges, findTextOffset } from "./describeTrackedChanges.js";
import { requireDocument, requireReviewCapableProject, withReviewSession } from "./openReviewSession.js";

/**
 * The tools that reach Overleaf's editor rather than its Git bridge.
 *
 * Everything else in this server publishes finished text: a push through the Git bridge always
 * arrives as ordinary content, whatever track-changes mode the project is in. These tools send
 * the same kind of operation the web editor sends, with the tracked-changes flag set, so an
 * edit arrives in the review panel as a suggestion a co-author accepts or rejects.
 *
 * They need a session cookie rather than a Git token, so they are registered only when one is
 * configured. A server without it offers the other sixteen tools unchanged.
 */

const pathArgument = z
  .string()
  .describe("Path of the document relative to the project root, for example main.tex.");

function newThreadId(): string {
  return randomBytes(12).toString("hex");
}

export function registerReviewTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_tracked_changes",
    {
      title: "List tracked changes and comments",
      description:
        "Read the tracked changes and review-panel comment threads on a document, as Overleaf's review panel shows them. " +
        "This reads the live editor rather than the Git bridge, so it sees suggestions that have not been accepted.",
      inputSchema: z.object({ project: projectArgument, path: pathArgument }),
      annotations: { readOnlyHint: true },
    },
    async ({ project, path }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, async (session) => {
          const document = requireDocument(session, path);
          const joined = await session.joinDocument(document.documentId);
          return textResult(
            truncateForModel(describeDocumentRanges(document.path, joined.lines, joined.ranges)),
          );
        }),
      ),
  );

  server.registerTool(
    "suggest_edit",
    {
      title: "Suggest an edit as a tracked change",
      description:
        "Replace an exact snippet of text so that it arrives in Overleaf as a tracked change, which a co-author can accept or reject, " +
        "instead of as a finished edit. Takes effect in Overleaf immediately; there is no separate push. " +
        "Use replace_text instead when the edit should simply be made.",
      inputSchema: z.object({
        project: projectArgument,
        path: pathArgument,
        findText: z.string().describe("Exact text to replace, including whitespace."),
        replaceWith: z
          .string()
          .describe("Replacement text. Empty suggests deleting the found text and nothing more."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ project, path, findText, replaceWith }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, async (session) => {
          requireReviewCapableProject(session);
          const document = requireDocument(session, path);
          const joined = await session.joinDocument(document.documentId);
          const position = findTextOffset(joined.lines, findText, "unique");

          // A tracked delete removes the text and records what it removed, so the insert that
          // follows it lands at the same position rather than after the old text.
          const operations: DocumentOperation[] = [{ p: position, d: findText }];
          if (replaceWith.length > 0) operations.push({ p: position, i: replaceWith });

          await session.applyOperations(
            document.documentId,
            joined.version,
            operations,
            generateTrackedChangeIdSeed(),
          );
          return textResult(
            `Suggested in ${document.path}: replace "${findText}" with "${replaceWith}".\n` +
              "It is in Overleaf now, in the review panel, waiting to be accepted or rejected.",
          );
        }),
      ),
  );

  server.registerTool(
    "add_comment",
    {
      title: "Comment on a passage",
      description:
        "Attach a review-panel comment thread to an exact snippet of text. The thread is anchored immediately; " +
        "the first message has to be written in Overleaf, because this connection cannot carry comment text.",
      inputSchema: z.object({
        project: projectArgument,
        path: pathArgument,
        quoteText: z.string().describe("Exact text the comment should be attached to."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ project, path, quoteText }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, async (session) => {
          const document = requireDocument(session, path);
          const joined = await session.joinDocument(document.documentId);
          const position = findTextOffset(joined.lines, quoteText, "unique");
          const threadId = newThreadId();

          await session.applyOperations(document.documentId, joined.version, [
            { p: position, c: quoteText, t: threadId },
          ]);
          return textResult(
            `Anchored a comment thread on "${quoteText}" in ${document.path} (thread ${threadId}).\n` +
              "Open the review panel in Overleaf to write the first message.",
          );
        }),
      ),
  );
}
