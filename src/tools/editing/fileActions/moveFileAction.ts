import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { describeDirectoryFiles, EMPTY_DIRECTORY_NOTE } from "./describeDirectoryFiles.js";

function samePathReply(path: string): string {
  return `path and toPath are the same file (${path}). Nothing was moved.`;
}

/**
 * Reached only where the disk and Git spell a folder differently: a collaborator renamed it to
 * another case while the clone had a new file in it, so both spellings pass the spelling check.
 */
function oneEntryRefusal(fromPath: string, toPath: string, kind: "file" | "directory"): string {
  const noun = kind === "file" ? "file" : "folder";
  return (
    `${fromPath} and ${toPath} are the same ${noun} on this computer's disk, ` +
    "which does not tell names that differ only in case apart. Nothing was moved."
  );
}

function movedFileReply(fromPath: string, toPath: string): string {
  return (
    `Moved ${fromPath} to ${toPath} in the local clone. ` +
    `Any \\input, \\include or \\includegraphics still naming ${fromPath} now points at nothing; ` +
    "search_project for it before calling push_changes."
  );
}

function movedDirectoryReply(fromPath: string, toPath: string, movedFiles: readonly string[]): string {
  if (movedFiles.length === 0) {
    return `Moved the empty directory ${fromPath} to ${toPath} in the local clone. ${EMPTY_DIRECTORY_NOTE}`;
  }
  return (
    `Moved the directory ${fromPath} to ${toPath}, with ${describeDirectoryFiles(movedFiles)}, in the local clone. ` +
    `Any \\input, \\include or \\includegraphics still naming a path under ${fromPath}/ now points at nothing; ` +
    "search_project for it before calling push_changes."
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

  // On a disk that ignores case, as macOS does by default, Main.tex is main.tex itself, so the
  // rename is made in place rather than refused as a move onto a file that exists.
  const destination = await directories.describeMoveDestination(fromPath, toPath);
  if (destination === "the source itself") return samePathReply(fromPath);
  if (destination === "the source respelled") {
    const movedFiles = await directories.respell(fromPath, toPath);
    return kind === "file"
      ? movedFileReply(fromPath, toPath)
      : movedDirectoryReply(fromPath, toPath, movedFiles);
  }

  if ((await directories.describePathKind(toPath)) !== "missing") {
    if ((await directories.compareExistingPaths(fromPath, toPath)) === "two names of one entry") {
      throw new Error(oneEntryRefusal(fromPath, toPath, kind));
    }
    // Overwriting here would destroy what the caller never named, and the reply would not
    // mention it. Refusing keeps both and puts the choice back.
    throw new Error(
      `${toPath} already exists. Nothing was moved. Delete it first, or choose another destination.`,
    );
  }

  if (kind === "file") {
    await repository.moveFile(fromPath, toPath);
    return movedFileReply(fromPath, toPath);
  }
  return movedDirectoryReply(fromPath, toPath, await directories.moveDirectory(fromPath, toPath));
}
