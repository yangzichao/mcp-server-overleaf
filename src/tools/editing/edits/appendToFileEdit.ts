import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireFileRevision } from "../../reading/fileRevisions.js";
import { appendOnNewLine, describeAppendedLines, describeMissingAppendTarget } from "../appendOnNewLine.js";
import { EDITS_ARE_LOCAL_UNTIL_PUSHED } from "../editFileArguments.js";

export interface FileAppend {
  readonly path: string;
  readonly expectedRevision: string | undefined;
  readonly content: string;
}

/** Adds content at the end of a file that already exists, leaving every line above it alone. */
export async function appendToFileEdit(repository: OverleafGitRepository, edit: FileAppend): Promise<string> {
  const kind = await repository.directories().describePathKind(edit.path);
  if (kind === "missing") throw new Error(describeMissingAppendTarget(edit.path));
  if (kind === "directory") {
    throw new Error(
      `${edit.path} is a folder, not a file, so text cannot be appended to it. Nothing was changed.`,
    );
  }
  const originalContent = await repository.readTextFile(edit.path);
  requireFileRevision(originalContent, edit.expectedRevision);
  if (edit.content === "") return `content is empty, so nothing was appended to ${edit.path}.`;
  await repository.writeTextFile(edit.path, appendOnNewLine(originalContent, edit.content));
  return `Appended ${describeAppendedLines(edit.content)} to the end of ${edit.path}. ${EDITS_ARE_LOCAL_UNTIL_PUSHED}`;
}
