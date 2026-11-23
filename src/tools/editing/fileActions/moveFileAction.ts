import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";

/** Renames or moves a file inside the clone; LaTeX references to the old path are not rewritten. */
export async function moveFileAction(
  repository: OverleafGitRepository,
  fromPath: string,
  toPath: string,
): Promise<string> {
  if (fromPath === toPath) return `path and toPath are the same file (${fromPath}). Nothing was moved.`;
  if (!(await repository.fileExists(fromPath)))
    return `${fromPath} is not in the project, so there is nothing to move.`;
  // Overwriting here would destroy a file the caller never named, and the reply would not
  // mention it. Refusing keeps both files and puts the choice back.
  if (await repository.fileExists(toPath)) {
    return `${toPath} already exists. Nothing was moved. Delete it first, or choose another destination.`;
  }

  await repository.moveFile(fromPath, toPath);
  return (
    `Moved ${fromPath} to ${toPath} in the local clone. ` +
    `Any \\input, \\include or \\includegraphics still naming ${fromPath} now points at nothing; ` +
    "search_project for it before calling push_changes."
  );
}
