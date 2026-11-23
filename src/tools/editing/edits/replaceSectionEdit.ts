import { replaceSectionText } from "../../../latex/parseLatexSections.js";
import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireFileRevision } from "../../reading/fileRevisions.js";
import { requireSectionByTitle } from "../../reading/readSectionByTitle.js";
import { EDITS_ARE_LOCAL_UNTIL_PUSHED } from "../editFileArguments.js";

export interface SectionReplacement {
  readonly path: string;
  readonly expectedRevision: string | undefined;
  readonly sectionTitle: string;
  readonly content: string;
}

/**
 * Replaces a section line for line, from its heading to the next heading of the same or a
 * shallower level, so trailing matter such as \end{document} is never swallowed.
 */
export async function replaceSectionEdit(
  repository: OverleafGitRepository,
  edit: SectionReplacement,
): Promise<string> {
  const originalContent = await repository.readTextFile(edit.path);
  requireFileRevision(originalContent, edit.expectedRevision);
  const section = requireSectionByTitle(edit.path, originalContent, edit.sectionTitle);
  await repository.writeTextFile(edit.path, replaceSectionText(originalContent, section, edit.content));
  return `Replaced \\${section.level}{${section.title}} (lines ${section.startLine}-${section.endLine}) in ${edit.path}. ${EDITS_ARE_LOCAL_UNTIL_PUSHED}`;
}
