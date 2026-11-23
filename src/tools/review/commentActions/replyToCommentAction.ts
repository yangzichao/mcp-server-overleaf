import { fetchCommentThreads, postCommentMessage } from "../../../overleaf/web/commentThreads.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";

/** Adds a message to a thread that exists; it neither changes the paper nor resolves the thread. */
export async function replyToCommentAction(
  context: ToolContext,
  project: string | undefined,
  threadId: string,
  message: string,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const { overleafProjectId } = context.projectRegistry.resolveEditorProject(project);
  // Overleaf creates a thread for any id it is sent a message for. Checking first keeps a
  // mistyped id from becoming a new thread that no text in the paper points to.
  const threads = await fetchCommentThreads(webClient, overleafProjectId);
  if (!threads.has(threadId)) {
    throw new Error(
      `No comment thread ${threadId} in this project. read_review (view comments) shows the thread ids that exist.`,
    );
  }
  await postCommentMessage(webClient, overleafProjectId, threadId, message);
  return textResult(`Replied in thread ${threadId}.`);
}
