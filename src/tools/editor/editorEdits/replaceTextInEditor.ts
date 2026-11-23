import { requireEditorSafeText } from "../../../overleaf/realtime/editorSafeText.js";
import { buildReplacementOperations } from "../../../overleaf/realtime/replacementOperations.js";
import { requireOneSnippetMatch } from "../../editing/edits/requireOneSnippetMatch.js";
import { requireDocument, withReviewSession } from "../../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { EDITOR_CHANGE_IS_LIVE } from "../editorFileArguments.js";
import { requireEditorWriteAccess } from "./requireEditorWriteAccess.js";

export interface EditorTextReplacement {
  readonly project: string | undefined;
  readonly path: string;
  readonly findText: string;
  readonly replaceWith: string;
  readonly replaceAll: boolean;
}

/** Replaces an exact snippet, sent against the document version it was matched in. */
export function replaceTextInEditor(
  context: ToolContext,
  edit: EditorTextReplacement,
): Promise<ToolTextResult> {
  requireEditorSafeText(edit.replaceWith, "replaceWith");
  return withReviewSession(context, edit.project, async (session) => {
    const document = requireDocument(session, edit.path);
    const joined = await session.joinDocument(document.documentId);
    const replacement = buildReplacementOperations(
      joined.lines.join("\n"),
      edit.findText,
      edit.replaceWith,
      edit.replaceAll,
    );
    // Before the access check, so a reviewer hears about a wrong snippet as an editor does.
    requireOneSnippetMatch(document.path, replacement);
    requireEditorWriteAccess(session);
    await session.applyOperations(document.documentId, joined.version, replacement.operations);
    return textResult(
      `Replaced ${replacement.occurrenceCount} occurrence(s) in ${document.path}. ${EDITOR_CHANGE_IS_LIVE}`,
    );
  });
}
