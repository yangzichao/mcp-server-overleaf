/**
 * The `ranges` Overleaf hands back from `joinDoc`, read into records a tool can print.
 *
 * The shapes come from `libraries/ranges-tracker/index.cjs` in `overleaf/overleaf`. A tracked
 * change is `{ id, op, metadata }` where `op` is `{ p, i }` for an insertion and `{ p, d }`
 * for a deletion. A comment is `{ id, op: { c, p, t }, metadata }`, where `c` is the text the
 * comment is anchored to and `t` is the thread id.
 *
 * The comment's own messages are not in here. They come from a separate endpoint, so a comment
 * read from ranges alone carries its anchor and thread but no text.
 */

export type TrackedChangeKind = "insertion" | "deletion";

export interface TrackedChange {
  readonly changeId: string;
  readonly kind: TrackedChangeKind;
  /** The inserted text, or the text that a deletion proposes to remove. */
  readonly text: string;
  /** Character offset into the document, as Overleaf counts it. */
  readonly position: number;
  readonly authorId: string | undefined;
  readonly madeAt: string | undefined;
}

export interface CommentThreadAnchor {
  readonly commentId: string;
  readonly threadId: string;
  /** The passage the comment hangs on, which is what the review panel highlights. */
  readonly quotedText: string;
  readonly position: number;
}

export interface DocumentRanges {
  readonly changes: readonly TrackedChange[];
  readonly comments: readonly CommentThreadAnchor[];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readTimestamp(value: unknown): string | undefined {
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  return undefined;
}

function readChange(entry: unknown): TrackedChange | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const change = entry as { id?: unknown; op?: unknown; metadata?: unknown };
  const changeId = readString(change.id);
  if (!changeId || !change.op || typeof change.op !== "object") return undefined;
  const op = change.op as { p?: unknown; i?: unknown; d?: unknown };
  const inserted = readString(op.i);
  const deleted = readString(op.d);
  const text = inserted ?? deleted;
  if (text === undefined) return undefined;
  const metadata = (change.metadata ?? {}) as { user_id?: unknown; ts?: unknown };
  return {
    changeId,
    kind: inserted !== undefined ? "insertion" : "deletion",
    text,
    position: typeof op.p === "number" ? op.p : 0,
    authorId: readString(metadata.user_id),
    madeAt: readTimestamp(metadata.ts),
  };
}

function readComment(entry: unknown): CommentThreadAnchor | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const comment = entry as { id?: unknown; op?: unknown };
  if (!comment.op || typeof comment.op !== "object") return undefined;
  const op = comment.op as { c?: unknown; p?: unknown; t?: unknown };
  const threadId = readString(op.t);
  if (!threadId) return undefined;
  return {
    commentId: readString(comment.id) ?? threadId,
    threadId,
    quotedText: readString(op.c) ?? "",
    position: typeof op.p === "number" ? op.p : 0,
  };
}

/**
 * A document with no suggestions and no comments comes back as `{}` rather than as empty
 * arrays, so every field is treated as optional here.
 */
export function readDocumentRanges(payload: unknown): DocumentRanges {
  if (!payload || typeof payload !== "object") return { changes: [], comments: [] };
  const ranges = payload as { changes?: unknown; comments?: unknown };
  const changes = (Array.isArray(ranges.changes) ? ranges.changes : [])
    .map(readChange)
    .filter((change): change is TrackedChange => change !== undefined)
    .sort((left, right) => left.position - right.position);
  const comments = (Array.isArray(ranges.comments) ? ranges.comments : [])
    .map(readComment)
    .filter((comment): comment is CommentThreadAnchor => comment !== undefined)
    .sort((left, right) => left.position - right.position);
  return { changes, comments };
}

/**
 * Overleaf counts positions in characters across the whole document, joined by newlines.
 * A reader wants a line number, so this converts one to the other against the lines the same
 * `joinDoc` call returned.
 */
export function describeLineForPosition(lines: readonly string[], position: number): number {
  let consumed = 0;
  let lineNumber = 0;
  for (const line of lines) {
    lineNumber += 1;
    consumed += line.length + 1;
    if (position < consumed) return lineNumber;
  }
  return lines.length;
}
