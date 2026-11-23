import { deleteCommentMessage } from "../../../overleaf/web/commentMessages.js";
import { fetchCommentThreads } from "../../../overleaf/web/commentThreads.js";
import { OverleafWebRequestError } from "../../../overleaf/web/overleafWebErrors.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { withReviewSession } from "../openReviewSession.js";
import { findCommentMessage } from "./findCommentMessage.js";

/**
 * Deletes one reply from a thread, then reads the thread again to see that it is gone. The first
 * message is refused: it is the thread's own text, and Overleaf's review panel removes the whole
 * thread when it is deleted, which is what action delete does. The editor connection supplies the
 * access level, which decides between the editors' route and the reviewers' own-messages route.
 */
export function deleteCommentMessageAction(
  context: ToolContext,
  project: string | undefined,
  target: { readonly threadId: string; readonly messageId: string },
): Promise<ToolTextResult> {
  return withReviewSession(context, project, async (session) => {
    const webClient = requireOverleafWebClient(context);
    const projectId = session.project.projectId;
    const found = findCommentMessage(
      await fetchCommentThreads(webClient, projectId),
      target.threadId,
      target.messageId,
    );
    if (found.opensThread) {
      throw new Error(
        `Message ${target.messageId} opens thread ${target.threadId}. Use action delete to remove the whole thread, or edit_message to change its text.`,
      );
    }
    try {
      await deleteCommentMessage(
        webClient,
        projectId,
        target.threadId,
        target.messageId,
        session.permissionsLevel,
      );
    } catch (error) {
      if (
        error instanceof OverleafWebRequestError &&
        error.status === 403 &&
        session.permissionsLevel === "review"
      ) {
        throw new Error(
          `Overleaf refused to delete message ${target.messageId}, which ${found.message.authorName} wrote: with review access, only one's own messages can be deleted.`,
        );
      }
      throw error;
    }
    const stillThere = (await fetchCommentThreads(webClient, projectId))
      .get(target.threadId)
      ?.messages.some((message) => message.messageId === target.messageId);
    if (stillThere) {
      throw new Error(
        `Overleaf accepted the deletion, but message ${target.messageId} is still in thread ${target.threadId} when the thread is read again.`,
      );
    }
    return textResult(
      `Deleted message ${target.messageId} by ${found.message.authorName} from thread ${target.threadId}; reading the thread again confirms it is gone, and the thread's other messages stay.`,
    );
  });
}
