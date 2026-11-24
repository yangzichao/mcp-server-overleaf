import { randomBytes } from "node:crypto";

import { deleteCommentThread, postCommentMessage } from "../../../overleaf/web/commentThreads.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { findTextOffset } from "../describeTrackedChanges.js";
import { requireDocument, withReviewSession } from "../openReviewSession.js";

export interface NewComment {
  readonly project: string | undefined;
  readonly path: string;
  readonly quoteText: string;
  readonly message: string;
}

/** Overleaf's own thread ids are 24 hexadecimal characters, the shape of a Mongo ObjectId. */
function newThreadId(): string {
  return randomBytes(12).toString("hex");
}

/**
 * A thread has two halves that live in different places: the anchor is a range in the document,
 * set with an editor operation, and the messages live in Overleaf's chat service, reached over
 * the web application. This writes both, in the order the web editor does.
 */
export function addCommentAction(context: ToolContext, comment: NewComment): Promise<ToolTextResult> {
  return withReviewSession(context, comment.project, async (session) => {
    const webClient = requireOverleafWebClient(context);
    const document = requireDocument(session, comment.path);
    const joined = await session.joinDocument(document.documentId);
    const position = findTextOffset(joined.lines, comment.quoteText, "No comment was added.");
    const threadId = newThreadId();

    // The web editor posts the message first and anchors it second, so a thread is never
    // visible in the document without its text. If anchoring then fails, the message is
    // removed again rather than left behind with nothing to hang on.
    await postCommentMessage(webClient, session.project.projectId, threadId, comment.message);
    try {
      await session.applyOperations(document.documentId, joined.version, [
        { p: position, c: comment.quoteText, t: threadId },
      ]);
    } catch (error) {
      await deleteCommentThread(webClient, session.project.projectId, document.documentId, threadId).catch(
        () => undefined,
      );
      throw error;
    }
    return textResult(`Commented on "${comment.quoteText}" in ${document.path} (thread ${threadId}).`);
  });
}
