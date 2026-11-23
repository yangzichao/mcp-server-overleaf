import { fetchWordCount, type ProjectWordCount } from "../../../overleaf/web/projects/projectWordCount.js";
import { findMainDocumentPath } from "../../editor/editorProjectViews/editorFilesView.js";
import { requireDocument, withReviewSession } from "../../review/openReviewSession.js";
import type { ToolContext } from "../../toolContext.js";
import { requireOverleafWebClient } from "../../web/requireOverleafWebClient.js";

/**
 * Overleaf's own word count, the one its editor menu shows, which runs texcount on Overleaf's
 * compile servers. The editor connection names the main document and checks path first, so a
 * wrong path fails with the documents that exist instead of a count of nothing.
 */

function describeCounts(subject: string, counts: ProjectWordCount): string {
  const lines = [
    `Overleaf's word count for ${subject}:`,
    `Words in text: ${counts.textWords}`,
    `Words in headings: ${counts.headingWords}`,
    `Words outside text (captions and the like): ${counts.wordsOutsideText}`,
    `Headings: ${counts.headingCount}`,
    `Floats (figures, tables and the like): ${counts.floatCount}`,
    `Inline math: ${counts.inlineMathCount}`,
    `Displayed math: ${counts.displayMathCount}`,
  ];
  if (counts.errorCount > 0) {
    lines.push(`texcount reported ${counts.errorCount} error${counts.errorCount === 1 ? "" : "s"}.`);
  }
  if (counts.messages) lines.push(`texcount's messages:\n${counts.messages}`);
  return lines.join("\n");
}

export function describeOverleafWordCount(
  context: ToolContext,
  project: string | undefined,
  path: string | undefined,
): Promise<string> {
  return withReviewSession(context, project, async (session) => {
    const webClient = requireOverleafWebClient(context);
    const countedPath = path === undefined ? undefined : requireDocument(session, path).path;
    const counts = await fetchWordCount(
      webClient,
      session.project.projectId,
      countedPath ? { filePath: countedPath } : {},
    );
    const mainDocument = findMainDocumentPath(session.project);
    const subject =
      countedPath ?? (mainDocument ? `${mainDocument}, the main document` : "the main document");
    return describeCounts(subject, counts);
  });
}
