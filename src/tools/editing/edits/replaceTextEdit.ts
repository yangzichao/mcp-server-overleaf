import { replaceTextOccurrences } from "../../../latex/replaceTextOccurrences.js";
import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireFileRevision } from "../../reading/fileRevisions.js";
import { EDITS_ARE_LOCAL_UNTIL_PUSHED } from "../editFileArguments.js";

export interface TextReplacement {
  readonly path: string;
  readonly expectedRevision: string | undefined;
  readonly findText: string;
  readonly replaceWith: string;
  readonly replaceAll: boolean;
}

/** Replaces an exact snippet; a missing or ambiguous one changes nothing and says why. */
export async function replaceTextEdit(
  repository: OverleafGitRepository,
  edit: TextReplacement,
): Promise<string> {
  const originalContent = await repository.readTextFile(edit.path);
  requireFileRevision(originalContent, edit.expectedRevision);
  const replacement = replaceTextOccurrences(
    originalContent,
    edit.findText,
    edit.replaceWith,
    edit.replaceAll,
  );

  if (replacement.status === "not-found") return `Text not found in ${edit.path}. Nothing was changed.`;
  if (replacement.status === "ambiguous") {
    return (
      `Text appears ${replacement.occurrenceCount} times in ${edit.path}. Nothing was changed. ` +
      "Include more surrounding context to make the match unique, or set replaceAll."
    );
  }

  await repository.writeTextFile(edit.path, replacement.updatedContent);
  return `Replaced ${replacement.occurrenceCount} occurrence(s) in ${edit.path}. ${EDITS_ARE_LOCAL_UNTIL_PUSHED}`;
}
