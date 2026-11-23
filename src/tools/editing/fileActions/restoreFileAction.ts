import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";

/** Puts one file back to what it was at a revision, binary files and deleted files included. */
export async function restoreFileAction(
  repository: OverleafGitRepository,
  path: string,
  revision: string,
): Promise<string> {
  const history = repository.history();
  const commit = await history.describeCommit(revision);
  const kind = await history.describePathAt(commit.hash, path);
  if (kind === "missing") {
    throw new Error(
      `${path} did not exist at revision ${revision}, so there is nothing to restore. To remove the file, use manage_files with action delete.`,
    );
  }
  // git restore on a folder rewrites every file in it and deletes the ones added since.
  if (kind === "folder") {
    throw new Error(
      `${path} was a folder at revision ${revision}. restore puts back one file, so nothing was restored; name each file to restore.`,
    );
  }
  // A text-only checkout keeps binary files off disk, and Git will not restore a path
  // outside the sparse patterns, so the restore needs the full checkout first.
  await repository.materializeAllFiles();
  await repository.restoreFileFromCommit(commit.hash, path);
  return (
    `Restored ${path} to revision ${commit.shortHash} (${commit.date}, ${commit.author}) in the local clone. ` +
    "Review it with read_project (view changes), then call push_changes to publish it to Overleaf."
  );
}
