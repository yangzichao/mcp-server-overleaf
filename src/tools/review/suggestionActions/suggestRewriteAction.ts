import {
  findSectionByTitle,
  parseLatexSections,
  replaceSectionText,
} from "../../../latex/parseLatexSections.js";
import { requireEditorSafeText } from "../../../overleaf/realtime/editorSafeText.js";
import { generateTrackedChangeIdSeed } from "../../../overleaf/realtime/overleafRealtimeSession.js";
import { buildTextChangeOperations } from "../../../overleaf/realtime/textChanges/textChangeOperations.js";
import { describeMissingSection } from "../../reading/readSectionByTitle.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireDocument, requireReviewCapableProject, withReviewSession } from "../openReviewSession.js";

/** "1 suggested deletion" or "3 suggested deletions". */
function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export interface SuggestedRewrite {
  readonly project: string | undefined;
  readonly path: string;
  /** One section to rewrite; undefined rewrites the whole document. */
  readonly sectionTitle: string | undefined;
  readonly content: string;
}

/**
 * Proposes new text for a section or a whole document as tracked changes. Only the passages that
 * differ are sent, each as its own suggested deletion and insertion, so a co-author reviews the
 * actual edits rather than one replacement of everything, and text that stays the same keeps its
 * comments.
 */
export function suggestRewrite(context: ToolContext, rewrite: SuggestedRewrite): Promise<ToolTextResult> {
  requireEditorSafeText(rewrite.content, "content");
  return withReviewSession(context, rewrite.project, async (session) => {
    requireReviewCapableProject(session);
    const document = requireDocument(session, rewrite.path);
    const joined = await session.joinDocument(document.documentId);
    const text = joined.lines.join("\n");

    let newText = rewrite.content;
    let scope = `the whole of ${document.path}`;
    if (rewrite.sectionTitle !== undefined) {
      const sections = parseLatexSections(text);
      const section = findSectionByTitle(sections, rewrite.sectionTitle);
      if (!section) {
        return textResult(
          describeMissingSection(
            document.path,
            rewrite.sectionTitle,
            sections.map((entry) => entry.title),
          ),
        );
      }
      newText = replaceSectionText(text, section, rewrite.content);
      scope = `\\${section.level}{${section.title}} (lines ${section.startLine}-${section.endLine}) in ${document.path}`;
    }

    const operations = buildTextChangeOperations(text, newText);
    if (operations.length === 0) {
      return textResult(`${scope} already reads exactly like content, so there is nothing to suggest.`);
    }
    await session.applyOperations(
      document.documentId,
      joined.version,
      operations,
      generateTrackedChangeIdSeed(),
    );
    const deletions = operations.filter((operation) => "d" in operation).length;
    const insertions = operations.length - deletions;
    return textResult(
      `Suggested a rewrite of ${scope} as ${countOf(deletions, "suggested deletion")} and ${countOf(insertions, "suggested insertion")}, covering only the passages that differ.\n` +
        "It is in Overleaf now, in the review panel, waiting to be accepted or rejected.",
    );
  });
}
