import {
  findSectionByTitle,
  parseLatexSections,
  replaceSectionText,
} from "../../../latex/parseLatexSections.js";
import { requireEditorSafeText } from "../../../overleaf/realtime/editorSafeText.js";
import { describeMissingSection } from "../../reading/readSectionByTitle.js";
import { requireDocument, withReviewSession } from "../../review/openReviewSession.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { EDITOR_CHANGE_IS_LIVE } from "../editorFileArguments.js";
import { requireEditorWriteAccess } from "./requireEditorWriteAccess.js";
import { sendTextChange } from "./sendTextChange.js";

export interface EditorSectionReplacement {
  readonly project: string | undefined;
  readonly path: string;
  readonly sectionTitle: string;
  readonly content: string;
}

/**
 * Replaces a section as the Git edit does, from its heading to the next heading of the same or a
 * shallower level, then sends only the lines that differ.
 */
export function replaceSectionInEditor(
  context: ToolContext,
  edit: EditorSectionReplacement,
): Promise<ToolTextResult> {
  requireEditorSafeText(edit.content, "content");
  return withReviewSession(context, edit.project, async (session) => {
    const document = requireDocument(session, edit.path);
    const joined = await session.joinDocument(document.documentId);
    const text = joined.lines.join("\n");
    const sections = parseLatexSections(text);
    const section = findSectionByTitle(sections, edit.sectionTitle);
    if (!section) {
      return textResult(
        describeMissingSection(
          document.path,
          edit.sectionTitle,
          sections.map((entry) => entry.title),
        ),
      );
    }
    requireEditorWriteAccess(session);
    const heading = `\\${section.level}{${section.title}} (lines ${section.startLine}-${section.endLine})`;
    if (!(await sendTextChange(session, joined, replaceSectionText(text, section, edit.content)))) {
      return textResult(
        `${heading} in ${document.path} already reads exactly like content. Nothing was changed.`,
      );
    }
    return textResult(`Replaced ${heading} in ${document.path}. ${EDITOR_CHANGE_IS_LIVE}`);
  });
}
