import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { describeDirectoryFiles, EMPTY_DIRECTORY_NOTE } from "./describeDirectoryFiles.js";

function samePathReply(path: string): string {
  return `path and toPath are the same file (${path}). Nothing was moved.`;
}

/**
 * A clone on such a disk has core.ignorecase set, so Git sees no change after a rename that
 * changes only case, and push_changes would publish nothing. A rename made in Overleaf syncs back.
 */
function oneEntryRefusal(fromPath: string, toPath: string, kind: "file" | "directory"): string {
  const noun = kind === "file" ? "file" : "folder";
  return (
    `${fromPath} and ${toPath} are the same ${noun} on this computer's disk, which does not tell the two names apart, ` +
    "so the clone cannot rename one to the other. Nothing was moved. " +
    "Rename it in Overleaf's editor; the clone picks up the new name at its next sync."
  );
}

/**
 * Renames or moves a file, or a directory with everything in it, inside the clone. LaTeX
 * references to the old path are not rewritten.
 */
export async function moveFileAction(
  repository: OverleafGitRepository,
  fromPath: string,
  toPath: string,
): Promise<string> {
  if (fromPath === toPath) return samePathReply(fromPath);
  const directories = repository.directories();
  const kind = await directories.describePathKind(fromPath);
  if (kind === "missing") throw new Error(`${fromPath} is not in the project, so there is nothing to move.`);
  if ((await directories.describePathKind(toPath)) !== "missing") {
    const relation = await directories.compareExistingPaths(fromPath, toPath);
    if (relation === "same path") return samePathReply(fromPath);
    // On a disk that ignores case, as macOS does by default, Main.tex is main.tex itself:
    // deleting it first, as the refusal below advises, would delete what was to be renamed.
    if (relation === "two names of one entry") throw new Error(oneEntryRefusal(fromPath, toPath, kind));
    // Overwriting here would destroy what the caller never named, and the reply would not
    // mention it. Refusing keeps both and puts the choice back.
    throw new Error(
      `${toPath} already exists. Nothing was moved. Delete it first, or choose another destination.`,
    );
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
