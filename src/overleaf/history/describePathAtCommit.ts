import type { HistoryGitRunner } from "./projectHistory.js";

export type PathKindAtCommit = "file" | "folder" | "missing";

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
