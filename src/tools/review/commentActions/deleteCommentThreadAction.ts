import { deleteCommentThread } from "../../../overleaf/web/commentThreads.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { locateCommentThread } from "../locateCommentThreads.js";
import { withReviewSession } from "../openReviewSession.js";

/** Removes a thread for everyone: its anchor in the document and every message in it. */
export function deleteCommentThreadAction(
  context: ToolContext,
  project: string | undefined,
  threadId: string,
  path: string | undefined,
): Promise<ToolTextResult> {
  return withReviewSession(context, project, async (session) => {
    const webClient = requireOverleafWebClient(context);
    const located = await locateCommentThread(session, threadId, path);
    await deleteCommentThread(webClient, session.project.projectId, located.document.documentId, threadId);
    return textResult(
      `Deleted thread ${threadId} on "${located.anchor.quotedText}" in ${located.document.path}, with all its messages.`,
    );
  });
}
