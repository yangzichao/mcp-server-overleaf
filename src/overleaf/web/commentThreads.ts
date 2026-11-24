import type { OverleafWebClient } from "./overleafWebClient.js";

/**
 * The messages inside review-panel comment threads, which live in Overleaf's chat service
 * rather than in the document. The document holds only the anchor: which text a thread
 * hangs on. Reading a whole comment therefore takes both, joined on the thread id.
 *
 * The routes are the ones the open-source editor calls in
 * `services/web/frontend/js/features/review-panel/context/threads-context.tsx`, and the
 * shape is `ReviewPanelCommentThread` from `services/web/types/review-panel/`. The web
 * routes themselves sit in a module outside the open-source tree, so the editor's own
 * requests are the contract followed here.
 */

export interface CommentThreadMessage {
  readonly messageId: string;
  readonly content: string;
  readonly authorName: string;
  readonly authorId: string | undefined;
  readonly postedAt: string | undefined;
}

export interface CommentThread {
  readonly threadId: string;
  readonly messages: readonly CommentThreadMessage[];
  readonly resolved: boolean;
  readonly resolvedAt: string | undefined;
  readonly resolvedByName: string | undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readTimestamp(value: unknown): string | undefined {
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  return undefined;
}

/** `ChatManager.injectUserInfoIntoThreads` attaches `user` with a display name, when it can. */
function readUserName(user: unknown, fallbackId: string | undefined): string {
  if (user && typeof user === "object") {
    const candidate = user as { name?: unknown; first_name?: unknown; last_name?: unknown; email?: unknown };
    const name =
      readString(candidate.name) ??
      [readString(candidate.first_name), readString(candidate.last_name)].filter(Boolean).join(" ");
    if (name) return name;
    const email = readString(candidate.email);
    if (email) return email;
  }
  return fallbackId ? `user ${fallbackId}` : "an unknown user";
}

function readMessage(entry: unknown): CommentThreadMessage | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const message = entry as {
    id?: unknown;
    content?: unknown;
    timestamp?: unknown;
    user_id?: unknown;
    user?: unknown;
  };
  const content = typeof message.content === "string" ? message.content : undefined;
  if (content === undefined) return undefined;
  const authorId = readString(message.user_id);
  return {
    messageId: readString(message.id) ?? "",
    content,
    authorName: readUserName(message.user, authorId),
    authorId,
    postedAt: readTimestamp(message.timestamp),
  };
}

/** Exported for tests: turns the `/threads` payload into records, tolerating missing fields. */
export function readCommentThreads(payload: unknown): Map<string, CommentThread> {
  const threads = new Map<string, CommentThread>();
  if (!payload || typeof payload !== "object") return threads;
  for (const [threadId, raw] of Object.entries(payload as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const thread = raw as {
      messages?: unknown;
      resolved?: unknown;
      resolved_at?: unknown;
      resolved_by_user_id?: unknown;
      resolved_by_user?: unknown;
    };
    const messages = (Array.isArray(thread.messages) ? thread.messages : [])
      .map(readMessage)
      .filter((message): message is CommentThreadMessage => message !== undefined);
    const resolved = thread.resolved === true;
    threads.set(threadId, {
      threadId,
      messages,
      resolved,
      resolvedAt: resolved ? readTimestamp(thread.resolved_at) : undefined,
      resolvedByName: resolved
        ? readUserName(thread.resolved_by_user, readString(thread.resolved_by_user_id))
        : undefined,
    });
  }
  return threads;
}

export async function fetchCommentThreads(
  client: OverleafWebClient,
  overleafProjectId: string,
): Promise<Map<string, CommentThread>> {
  return readCommentThreads(await client.getJson(`/project/${overleafProjectId}/threads`));
}

/** Adds a message to a thread, creating the thread if this is its first message. */
export async function postCommentMessage(
  client: OverleafWebClient,
  overleafProjectId: string,
  threadId: string,
  content: string,
): Promise<void> {
  await client.postJson(`/project/${overleafProjectId}/thread/${threadId}/messages`, { content });
}

export async function setCommentThreadResolved(
  client: OverleafWebClient,
  overleafProjectId: string,
  documentId: string,
  threadId: string,
  resolved: boolean,
): Promise<void> {
  const action = resolved ? "resolve" : "reopen";
  await client.postJson(`/project/${overleafProjectId}/doc/${documentId}/thread/${threadId}/${action}`);
}

/** Removes the thread, its messages and its anchor in the document. */
export async function deleteCommentThread(
  client: OverleafWebClient,
  overleafProjectId: string,
  documentId: string,
  threadId: string,
): Promise<void> {
  await client.delete(`/project/${overleafProjectId}/doc/${documentId}/thread/${threadId}`);
}
