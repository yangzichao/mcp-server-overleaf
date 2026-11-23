import type { HistoryGitRunner } from "./projectHistory.js";

/** What a path named in one commit: a file, a folder, or nothing. */
export type PathKindAtCommit = "file" | "folder" | "missing";

/**
 * Reads the kind from `git cat-file -t`. `cat-file -e` alone says a folder exists too, which let
 * a read return a folder's listing as text and a restore rewrite every file in a folder.
 */
export async function describePathAtCommit(
  git: HistoryGitRunner,
  commitHash: string,
  gitPath: string,
): Promise<PathKindAtCommit> {
  const result = await git(["cat-file", "-t", `${commitHash}:${gitPath}`], { tolerateFailure: true });
  if (result.exitCode !== 0) return "missing";
  const objectType = result.stdout.trim();
  if (objectType === "blob") return "file";
  return objectType === "tree" ? "folder" : "missing";
}
