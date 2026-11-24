import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import {
  type CopiedFile,
  describeCopiedFileCount,
  describeCopiedFiles,
  describeReplacedCount,
  describeSkippedEntries,
} from "../folderUpload/describeFolderUpload.js";
import {
  describeFolderUploadDestination,
  type FolderUploadTarget,
  planFolderUploadTargets,
} from "../folderUpload/folderUploadTargets.js";
import { readFolderUploadFile } from "../folderUpload/readFolderUploadFile.js";
import type { LocalFolderListing } from "../folderUpload/readLocalFolder.js";

function foldersOnTheWay(projectPath: string): string[] {
  const names = projectPath.split("/");
  return names.slice(0, -1).map((_, index) => names.slice(0, index + 1).join("/"));
}

async function findReplacedFiles(
  repository: OverleafGitRepository,
  targets: readonly FolderUploadTarget[],
): Promise<Set<string>> {
  const directories = repository.directories();
  const checkedFolders = new Set<string>();
  const replaced = new Set<string>();
  for (const target of targets) {
    for (const folder of foldersOnTheWay(target.projectPath)) {
      if (checkedFolders.has(folder)) continue;
      checkedFolders.add(folder);
      if ((await directories.describePathKind(folder)) === "file") {
        throw new Error(
          `${folder} is a file in the project, so ${target.projectPath} cannot go inside it. Nothing was copied.`,
        );
      }
    }
    const kind = await directories.describePathKind(target.projectPath);
    if (kind === "directory") {
      throw new Error(
        `${target.projectPath} is a folder in the project, so a file cannot be copied there. Nothing was copied.`,
      );
    }
    if (kind === "file") replaced.add(target.projectPath);
  }
  return replaced;
}

function describeStoppedCopy(
  copied: readonly CopiedFile[],
  failed: FolderUploadTarget,
  error: unknown,
): string {
  const reason = error instanceof Error ? error.message : String(error);
  if (copied.length === 0) return `${failed.projectPath} was not copied: ${reason} Nothing was copied.`;
  return [
    `Copied ${describeCopiedFileCount(copied)}, then ${failed.projectPath} was not copied: ${reason}`,
    ...describeCopiedFiles(copied),
    "The copied files are in the local clone only; read_project (view changes) shows them, and discard_local_changes or manage_files (action delete) takes them out again.",
  ].join("\n");
}

export async function uploadFolderAction(
  repository: OverleafGitRepository,
  destination: string,
  listing: LocalFolderListing,
): Promise<string> {
  const targets = planFolderUploadTargets(destination, listing.files);
  const replaced = await findReplacedFiles(repository, targets);
  // A text-only checkout would leave the new files outside the sparse patterns, where
  // `git add --all` skips them and the push silently goes without them.
  await repository.materializeAllFiles();
  const copied: CopiedFile[] = [];
  for (const target of targets) {
    try {
      await repository.writeFileBytes(target.projectPath, await readFolderUploadFile(target));
    } catch (error) {
      throw new Error(describeStoppedCopy(copied, target, error));
    }
    copied.push({
      projectPath: target.projectPath,
      size: target.file.size,
      replaced: replaced.has(target.projectPath),
    });
  }
  return [
    `Copied ${describeCopiedFileCount(copied)} from ${listing.folderPath} into ${describeFolderUploadDestination(destination)} in the local clone${describeReplacedCount(copied)}.`,
    ...describeCopiedFiles(copied),
    ...describeSkippedEntries(listing.skipped),
    "Review them with read_project (view changes), then call push_changes to publish them to Overleaf.",
  ].join("\n");
}
