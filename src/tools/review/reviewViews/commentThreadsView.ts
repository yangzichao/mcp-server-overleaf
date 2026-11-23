import { fetchCommentThreads } from "../../../overleaf/web/commentThreads.js";
import { type ToolContext, truncateForModel } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { describeCommentListing } from "../describeCommentThreads.js";
import { collectCommentAnchors } from "../locateCommentThreads.js";
import { withReviewSession } from "../openReviewSession.js";

/**
 * Comment threads with their messages. The anchors come from the editor and the messages from
 * the web application, so both are read and matched by thread id.
 */
export function describeCommentThreadsView(
  context: ToolContext,
  project: string | undefined,
  path: string | undefined,
  includeResolved: boolean,
): Promise<string> {
  return withReviewSession(context, project, async (session) => {
    const webClient = requireOverleafWebClient(context);
    const threads = await fetchCommentThreads(webClient, session.project.projectId);
    const anchored = await collectCommentAnchors(session, path);
    return truncateForModel(
      describeCommentListing({ anchored, threads, includeResolved, coveredWholeProject: !path }),
    );
  });
}
