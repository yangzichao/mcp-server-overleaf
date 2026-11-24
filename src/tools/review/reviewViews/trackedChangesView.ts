import { type ToolContext, truncateForModel } from "../../toolContext.js";
import { describeDocumentRanges } from "../describeTrackedChanges.js";
import { requireDocument, withReviewSession } from "../openReviewSession.js";

/** One document's suggestions and comment anchors, as the review panel shows them. */
export function describeTrackedChangesView(
  context: ToolContext,
  project: string | undefined,
  path: string,
): Promise<string> {
  return withReviewSession(context, project, async (session) => {
    const document = requireDocument(session, path);
    const joined = await session.joinDocument(document.documentId);
    return truncateForModel(describeDocumentRanges(document.path, joined.lines, joined.ranges));
  });
}
