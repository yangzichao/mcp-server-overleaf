import { requireEditorSafeText } from "../../../overleaf/realtime/editorSafeText.js";
import {
  type DocumentOperation,
  generateTrackedChangeIdSeed,
} from "../../../overleaf/realtime/overleafRealtimeSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { findTextOffset } from "../describeTrackedChanges.js";
import { requireDocument, requireReviewCapableProject, withReviewSession } from "../openReviewSession.js";

export interface SuggestedEdit {
  readonly project: string | undefined;
  readonly path: string;
  readonly findText: string;
  readonly replaceWith: string;
}

/**
 * Sends the replacement the way the web editor does with track changes on, so it arrives in the
 * review panel as a suggestion rather than as finished text.
 */
export function suggestEdit(context: ToolContext, edit: SuggestedEdit): Promise<ToolTextResult> {
  requireEditorSafeText(edit.replaceWith, "replaceWith");
  return withReviewSession(context, edit.project, async (session) => {
    requireReviewCapableProject(session);
    const document = requireDocument(session, edit.path);
    const joined = await session.joinDocument(document.documentId);
    const position = findTextOffset(joined.lines, edit.findText, "unique");

    // A tracked delete removes the text and records what it removed, so the insert that
    // follows it lands at the same position rather than after the old text.
    const operations: DocumentOperation[] = [{ p: position, d: edit.findText }];
    if (edit.replaceWith.length > 0) operations.push({ p: position, i: edit.replaceWith });

    await session.applyOperations(
      document.documentId,
      joined.version,
      operations,
      generateTrackedChangeIdSeed(),
    );
    return textResult(
      `Suggested in ${document.path}: replace "${edit.findText}" with "${edit.replaceWith}".\n` +
        "It is in Overleaf now, in the review panel, waiting to be accepted or rejected.",
    );
  });
}
