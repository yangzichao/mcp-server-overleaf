import { setCommentThreadResolved } from "../../../overleaf/web/commentThreads.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { locateCommentThread } from "../locateCommentThreads.js";
import { withReviewSession } from "../openReviewSession.js";

/** Resolves a thread, or reopens a resolved one; the thread and its messages stay either way. */
export function setCommentThreadStateAction(
  context: ToolContext,
  project: string | undefined,
  thread: { readonly threadId: string; readonly path: string | undefined; readonly resolved: boolean },
): Promise<ToolTextResult> {
  return withReviewSession(context, project, async (session) => {
    const webClient = requireOverleafWebClient(context);
    const located = await locateCommentThread(session, thread.threadId, thread.path);
    await setCommentThreadResolved(
      webClient,
      session.project.projectId,
      located.document.documentId,
      thread.threadId,
      thread.resolved,
    );
    return textResult(
      `${thread.resolved ? "Resolved" : "Reopened"} thread ${thread.threadId} on "${located.anchor.quotedText}" in ${located.document.path}.`,
    );
  });
}
