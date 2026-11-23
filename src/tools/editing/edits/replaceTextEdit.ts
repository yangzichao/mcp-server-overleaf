import { replaceTextOccurrences } from "../../../latex/replaceTextOccurrences.js";
import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireFileRevision } from "../../reading/fileRevisions.js";
import { EDITS_ARE_LOCAL_UNTIL_PUSHED } from "../editFileArguments.js";
import { requireSnippetReplaced } from "./requireSnippetReplaced.js";

export interface TextReplacement {
  readonly path: string;
  readonly expectedRevision: string | undefined;
  readonly findText: string;
  readonly replaceWith: string;
  readonly replaceAll: boolean;
}

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
  requireSnippetReplaced(edit.path, replacement);
  await repository.writeTextFile(edit.path, replacement.updatedContent);
  return `Replaced ${replacement.occurrenceCount} occurrence(s) in ${edit.path}. ${EDITS_ARE_LOCAL_UNTIL_PUSHED}`;
}
