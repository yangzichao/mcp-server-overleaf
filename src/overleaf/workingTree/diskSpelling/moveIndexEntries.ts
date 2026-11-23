import type { GitCommandResult } from "../../gitCommandRunner.js";

interface IndexEntry {
  readonly mode: string;
  readonly objectName: string;
  readonly gitPath: string;
}

function parseIndexEntry(record: string): IndexEntry {
  const tab = record.indexOf("\t");
  const [mode = "", objectName = ""] = record.slice(0, tab).split(" ");
  return { mode, objectName, gitPath: record.slice(tab + 1) };
}

/**
 * A clone on a disk that ignores case has core.ignorecase set, so after a rename that changes
 * only case on disk Git still finds every file under its old name, and push_changes would
 * publish nothing.
 */
export async function moveIndexEntries(
  git: (args: readonly string[]) => Promise<GitCommandResult>,
  fromGitPath: string,
  toGitPath: string,
): Promise<void> {
  const { stdout } = await git(["ls-files", "--stage", "-z", "--", `:(literal)${fromGitPath}`]);
  const entries = stdout
    .split("\0")
    .filter((record) => record !== "")
    .map(parseIndexEntry);
  if (entries.length === 0) return;
  await git(["update-index", "--force-remove", "--", ...entries.map((entry) => entry.gitPath)]);
  await git([
    "update-index",
    "--add",
    ...entries.flatMap((entry) => [
      "--cacheinfo",
      `${entry.mode},${entry.objectName},${toGitPath}${entry.gitPath.slice(fromGitPath.length)}`,
    ]),
  ]);
}
