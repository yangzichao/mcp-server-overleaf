import { editCommentMessage } from "../../../overleaf/web/commentMessages.js";
import { fetchCommentThreads } from "../../../overleaf/web/commentThreads.js";
import { OverleafWebRequestError } from "../../../overleaf/web/overleafWebErrors.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { findCommentMessage, quoteMessage } from "./findCommentMessage.js";

/**
 * Replaces the text of one message, then reads the thread again to see that the new text is
 * there: the edit route is outside Overleaf's open-source code, so its answer alone is not proof.
 */
export async function editCommentMessageAction(
  context: ToolContext,
  project: string | undefined,
  edit: { readonly threadId: string; readonly messageId: string; readonly content: string },
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const { overleafProjectId } = context.projectRegistry.resolveEditorProject(project);
  const found = findCommentMessage(
    await fetchCommentThreads(webClient, overleafProjectId),
    edit.threadId,
    edit.messageId,
  );
  try {
    await editCommentMessage(webClient, overleafProjectId, edit.threadId, edit.messageId, edit.content);
  } catch (error) {
    if (error instanceof OverleafWebRequestError && (error.status === 403 || error.status === 404)) {
      throw new Error(
        `Overleaf refused to edit message ${edit.messageId}, which ${found.message.authorName} wrote. Overleaf's editor offers editing only on one's own messages; reply in the thread instead.`,
      );
    }
    throw error;
  }
  const after = (await fetchCommentThreads(webClient, overleafProjectId))
    .get(edit.threadId)
    ?.messages.find((message) => message.messageId === edit.messageId);
  if (!after) {
    throw new Error(
      `Overleaf accepted the edit, but message ${edit.messageId} is no longer in thread ${edit.threadId} when the thread is read again.`,
    );
  }
  if (after.content.trim() !== edit.content.trim()) {
    throw new Error(
      `Overleaf accepted the edit, but reading thread ${edit.threadId} again shows message ${edit.messageId} still reading "${quoteMessage(after.content)}".`,
    );
  }
  return textResult(
    `Edited message ${edit.messageId} in thread ${edit.threadId}; reading the thread again shows the new text.`,
  );
}
