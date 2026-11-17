import type { OverleafDocumentEntry } from "../../overleaf/realtime/overleafProjectDocuments.js";
import type { OverleafRealtimeSession } from "../../overleaf/realtime/overleafRealtimeSession.js";
import {
  type CommentThreadAnchor,
  describeLineForPosition,
} from "../../overleaf/realtime/trackedChangeRanges.js";
import { requireDocument } from "./openReviewSession.js";

/**
 * Where comment threads are anchored. A thread's messages are project-wide, but resolving or
 * deleting one goes through the document it hangs on, and a reader wants its line number, so
 * both tools and listings need the anchor. Only the document knows it.
 */

export interface AnchoredCommentThread {
  readonly document: OverleafDocumentEntry;
  readonly anchor: CommentThreadAnchor;
  readonly lineNumber: number;
}

/** Reads the anchors in one document, or in every document when no path is given. */
export async function collectCommentAnchors(
  session: OverleafRealtimeSession,
  path: string | undefined,
): Promise<AnchoredCommentThread[]> {
  const documents = path ? [requireDocument(session, path)] : session.project.documents;
  const anchored: AnchoredCommentThread[] = [];
  for (const document of documents) {
    const joined = await session.joinDocument(document.documentId);
    for (const anchor of joined.ranges.comments) {
      anchored.push({ document, anchor, lineNumber: describeLineForPosition(joined.lines, anchor.position) });
    }
  }
  return anchored;
}

/** Finds the one document a thread is anchored in, searching every document if need be. */
export async function locateCommentThread(
  session: OverleafRealtimeSession,
  threadId: string,
  path: string | undefined,
): Promise<AnchoredCommentThread> {
  const anchors = await collectCommentAnchors(session, path);
  const found = anchors.find((entry) => entry.anchor.threadId === threadId);
  if (found) return found;
  const where = path ? `in ${path}` : "in any document of this project";
  throw new Error(
    `No comment thread ${threadId} is anchored ${where}. list_comments shows the thread ids that exist.`,
  );
}
