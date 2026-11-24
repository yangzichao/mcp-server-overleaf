import { requireEditorSafeText } from "../../../overleaf/realtime/editorSafeText.js";
import { findTreeEntity } from "../../../overleaf/realtime/overleafTreeEntities.js";
import {
  appendOnNewLine,
  describeAppendedLines,
  describeMissingAppendTarget,
} from "../../editing/appendOnNewLine.js";
import { describeEntityType } from "../../fileTree/describeTreeEntity.js";
import { requireDocument, withReviewSession } from "../../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { EDITOR_CHANGE_IS_LIVE } from "../editorFileArguments.js";
import { requireEditorWriteAccess } from "./requireEditorWriteAccess.js";
import { sendTextChange } from "./sendTextChange.js";

export interface EditorAppend {
  readonly project: string | undefined;
  readonly path: string;
  readonly content: string;
}

/** Adds content after a document's last line, as one insertion at its end. */
export function appendInEditor(context: ToolContext, edit: EditorAppend): Promise<ToolTextResult> {
  requireEditorSafeText(edit.content, "content");
  return withReviewSession(context, edit.project, async (session) => {
    const entity = findTreeEntity(session.project, edit.path);
    if (!entity) throw new Error(describeMissingAppendTarget(edit.path));
    if (entity.type !== "doc") {
      throw new Error(
        `${entity.path} is ${describeEntityType(entity.type)} in Overleaf, so text cannot be appended to it. Nothing was changed.`,
      );
    }
    const document = requireDocument(session, entity.path);
    if (edit.content === "")
      return textResult(`content is empty, so nothing was appended to ${document.path}.`);
    requireEditorWriteAccess(session);
    const joined = await session.joinDocument(document.documentId);
    await sendTextChange(session, joined, appendOnNewLine(joined.lines.join("\n"), edit.content));
    return textResult(
      `Appended ${describeAppendedLines(edit.content)} to the end of ${document.path}. ${EDITOR_CHANGE_IS_LIVE}`,
    );
  });
}
