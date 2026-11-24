import { requireOverleafId, requireSafePathSegment } from "./overleafIds.js";
import type { OverleafWebClient } from "./overleafWebClient.js";
import { RequestNotSentError } from "./overleafWebErrors.js";

/**
 * Editing and deleting one message inside a review-panel comment thread. The routes are the ones
 * `review-panel/context/threads-context.tsx` calls, and the choice between the two delete routes
 * is the one `review-panel-comment.tsx` makes: owners and editors (`resolveAllComments`) delete
 * any message, reviewers (`resolveOwnComments`) only their own, through `own-messages`. The
 * server side is outside Overleaf's open-source tree, as for the rest of the comment routes.
 */

function messagePath(projectId: string, threadId: string, messageId: string, collection: string): string {
  return `/project/${requireOverleafId(projectId, "Project id")}/thread/${requireOverleafId(threadId, "Thread id")}/${collection}/${requireSafePathSegment(messageId, "Message id")}`;
}

/** The editor offers this only on the signed-in user's own messages. */
export async function editCommentMessage(
  client: OverleafWebClient,
  projectId: string,
  threadId: string,
  messageId: string,
  content: string,
): Promise<void> {
  if (!content.trim()) throw new RequestNotSentError("A comment message cannot be empty.");
  await client.postIgnoringAnswer(`${messagePath(projectId, threadId, messageId, "messages")}/edit`, {
    content,
  });
}

/** `permissionsLevel` is the real-time session's: owner, readAndWrite, review or readOnly. */
export async function deleteCommentMessage(
  client: OverleafWebClient,
  projectId: string,
  threadId: string,
  messageId: string,
  permissionsLevel: string,
): Promise<void> {
  if (permissionsLevel === "owner" || permissionsLevel === "readAndWrite") {
    await client.delete(messagePath(projectId, threadId, messageId, "messages"));
    return;
  }
  if (permissionsLevel === "review") {
    await client.delete(messagePath(projectId, threadId, messageId, "own-messages"));
    return;
  }
  throw new RequestNotSentError("Deleting a comment message needs review or edit access to the project.");
}
