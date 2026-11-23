import type { CommentThread, CommentThreadMessage } from "../../../overleaf/web/commentThreads.js";

/**
 * Finds the thread and message an edit or deletion names, before anything is sent, so a wrong id
 * fails with the ids that do exist rather than as Overleaf's bare not-found.
 */

export interface FoundCommentMessage {
  readonly thread: CommentThread;
  readonly message: CommentThreadMessage;
  /** The first message is the thread's own text; the review panel deletes the thread with it. */
  readonly opensThread: boolean;
}

function describeMessageIds(thread: CommentThread): string {
  const listed = thread.messages
    .filter((message) => message.messageId)
    .map((message) => `[message ${message.messageId}] by ${message.authorName}`);
  return listed.length > 0 ? `Its messages: ${listed.join(", ")}.` : "It has no messages.";
}

export function findCommentMessage(
  threads: ReadonlyMap<string, CommentThread>,
  threadId: string,
  messageId: string,
): FoundCommentMessage {
  const thread = threads.get(threadId);
  if (!thread) {
    throw new Error(
      `No comment thread ${threadId} in this project. read_review (view comments) shows the thread ids that exist.`,
    );
  }
  const index = thread.messages.findIndex((message) => message.messageId === messageId);
  const message = thread.messages[index];
  if (!message)
    throw new Error(`Thread ${threadId} has no message ${messageId}. ${describeMessageIds(thread)}`);
  return { thread, message, opensThread: index === 0 };
}

export function quoteMessage(content: string): string {
  const single = content.replace(/\n/g, "\\n");
  return single.length <= 200 ? single : `${single.slice(0, 200)}…`;
}
