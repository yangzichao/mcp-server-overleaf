import type { GitCommandResult } from "./gitCommandRunner.js";

type GitRunner = (
  args: readonly string[],
  options?: { tolerateFailure?: boolean },
) => Promise<GitCommandResult>;

/** Review committed, staged, unstaged and new files without changing the real index. */
export async function pendingProjectDiff(
  git: GitRunner,
  remoteBranch: string,
  validatePath: (path: string) => Promise<unknown>,
  /** Narrows the diff to one file or directory, already validated and in Git's form. */
  gitPath?: string,
): Promise<string> {
  const pathspec = gitPath ? [`:(literal)${gitPath}`] : [];
  // Comparing against the merge base avoids presenting collaborators' newer work as
  // local deletions when a refused push has left the two histories diverged.
  const base = await git(["merge-base", "HEAD", remoteBranch]);
  const tracked = await git([
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    base.stdout.trim(),
    "--",
    ...pathspec,
  ]);
  const untracked = await git(["ls-files", "--others", "--exclude-standard", "-z", "--", ...pathspec]);
  const parts = [tracked.stdout];
  for (const path of untracked.stdout.split("\0").filter(Boolean)) {
    await validatePath(path);
    const diff = await git(
      ["diff", "--no-ext-diff", "--no-textconv", "--no-index", "--", "/dev/null", `./${path}`],
      {
        tolerateFailure: true,
      },
    );
    // --no-index returns 1 for a difference; any other failure must remain visible.
    if (diff.exitCode !== 0 && diff.exitCode !== 1) {
      throw new Error(`Could not review new file ${path}: ${diff.stderr}`);
    }
    parts.push(diff.stdout);
  }
  return parts.join("");
}
