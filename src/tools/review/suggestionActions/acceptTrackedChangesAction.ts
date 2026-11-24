import { acceptTrackedChanges } from "../../../overleaf/realtime/trackedChangeDecisions.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";
import { requireEditCapableProject, withReviewSession } from "../openReviewSession.js";
import {
  confirmChangesGone,
  describeDecidedChanges,
  selectTrackedChanges,
  type TrackedChangeSelection,
} from "./selectTrackedChanges.js";

/** Makes suggestions part of the paper: insertions become ordinary text, deletions go for good. */
export function acceptTrackedChangesAction(
  context: ToolContext,
  project: string | undefined,
  selection: TrackedChangeSelection,
): Promise<ToolTextResult> {
  return withReviewSession(context, project, async (session) => {
    requireEditCapableProject(session);
    const webClient = requireOverleafWebClient(context);
    const selected = await selectTrackedChanges(session, selection);
    await acceptTrackedChanges(
      webClient,
      session.project.projectId,
      selected.document.documentId,
      selected.changes.map((change) => change.changeId),
    );
    await confirmChangesGone(session, selected);
    return textResult(describeDecidedChanges("Accepted", selected));
  });
}
