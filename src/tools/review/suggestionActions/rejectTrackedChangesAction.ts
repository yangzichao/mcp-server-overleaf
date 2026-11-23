import { buildRejectionOperations } from "../../../overleaf/realtime/trackedChangeDecisions.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireEditCapableProject, withReviewSession } from "../openReviewSession.js";
import {
  confirmChangesGone,
  describeDecidedChanges,
  selectTrackedChanges,
  type TrackedChangeSelection,
} from "./selectTrackedChanges.js";

/**
 * Undoes suggestions. Overleaf has no route for this: the editor sends an ordinary edit flagged
 * as an undo for each one, from the end of the document backwards, and so does this.
 */
export function rejectTrackedChangesAction(
  context: ToolContext,
  project: string | undefined,
  selection: TrackedChangeSelection,
): Promise<ToolTextResult> {
  return withReviewSession(context, project, async (session) => {
    requireEditCapableProject(session);
    const selected = await selectTrackedChanges(session, selection);
    const operations = buildRejectionOperations(selected.lines, selected.changes);
    await session.applyOperations(selected.document.documentId, selected.version, operations);
    await confirmChangesGone(session, selected);
    return textResult(describeDecidedChanges("Rejected", selected));
  });
}
