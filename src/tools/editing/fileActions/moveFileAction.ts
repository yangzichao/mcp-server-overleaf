import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { describeDirectoryFiles, EMPTY_DIRECTORY_NOTE } from "./describeDirectoryFiles.js";

/**
 * Renames or moves a file, or a directory with everything in it, inside the clone. LaTeX
 * references to the old path are not rewritten.
 */
export async function moveFileAction(
  repository: OverleafGitRepository,
  fromPath: string,
  toPath: string,
): Promise<string> {
  if (fromPath === toPath) return `path and toPath are the same file (${fromPath}). Nothing was moved.`;
  const directories = repository.directories();
  const kind = await directories.describePathKind(fromPath);
  if (kind === "missing") return `${fromPath} is not in the project, so there is nothing to move.`;
  // Overwriting here would destroy what the caller never named, and the reply would not
  // mention it. Refusing keeps both and puts the choice back.
  if ((await directories.describePathKind(toPath)) !== "missing") {
    return `${toPath} already exists. Nothing was moved. Delete it first, or choose another destination.`;
  }

  if (kind === "file") {
    await repository.moveFile(fromPath, toPath);
    return (
      `Moved ${fromPath} to ${toPath} in the local clone. ` +
      `Any \\input, \\include or \\includegraphics still naming ${fromPath} now points at nothing; ` +
      "search_project for it before calling push_changes."
    );
  }
  const movedFiles = await directories.moveDirectory(fromPath, toPath);
  if (movedFiles.length === 0) {
    return `Moved the empty directory ${fromPath} to ${toPath} in the local clone. ${EMPTY_DIRECTORY_NOTE}`;
  }
  return (
    `Moved the directory ${fromPath} to ${toPath}, with ${describeDirectoryFiles(movedFiles)}, in the local clone. ` +
    `Any \\input, \\include or \\includegraphics still naming a path under ${fromPath}/ now points at nothing; ` +
    "search_project for it before calling push_changes."
  );
}
