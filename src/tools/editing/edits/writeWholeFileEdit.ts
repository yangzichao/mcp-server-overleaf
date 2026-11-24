import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireFileRevision } from "../../reading/fileRevisions.js";
import { EDITS_ARE_LOCAL_UNTIL_PUSHED } from "../editFileArguments.js";

export interface WholeFileWrite {
  readonly path: string;
  readonly expectedRevision: string | undefined;
  readonly content: string;
}

/** Creates the file or overwrites it entirely; with expectedRevision, only the version that was read. */
export async function writeWholeFileEdit(
  repository: OverleafGitRepository,
  edit: WholeFileWrite,
): Promise<string> {
  const existedBefore = await repository.fileExists(edit.path);
  if (edit.expectedRevision !== undefined) {
    if (!existedBefore)
      throw new Error("File no longer exists. Nothing was written; read the current project again.");
    requireFileRevision(await repository.readTextFile(edit.path), edit.expectedRevision);
  }
  await repository.writeTextFile(edit.path, edit.content);
  return `${existedBefore ? "Overwrote" : "Created"} ${edit.path}. ${EDITS_ARE_LOCAL_UNTIL_PUSHED}`;
}
