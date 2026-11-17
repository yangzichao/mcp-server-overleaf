import type { CommitSummary } from "../../overleaf/history/projectHistory.js";

const MAXIMUM_FILES_PER_COMMIT = 12;

const STATUS_WORDS: Record<string, string> = {
  A: "added",
  M: "changed",
  D: "deleted",
  R: "renamed to",
  C: "copied to",
  T: "type changed",
};

function describeCommit(commit: CommitSummary): string {
  const heading = `- ${commit.shortHash}  ${commit.date}  ${commit.author}  ${commit.subject}`;
  const shown = commit.changedFiles.slice(0, MAXIMUM_FILES_PER_COMMIT);
  const files = shown.map((file) => `    ${STATUS_WORDS[file.status] ?? file.status} ${file.path}`);
  if (commit.changedFiles.length > shown.length) {
    files.push(`    … and ${commit.changedFiles.length - shown.length} more files`);
  }
  return [heading, ...files].join("\n");
}

export function describeCommitHistory(
  commits: readonly CommitSummary[],
  scope: string,
  limit: number,
): string {
  if (commits.length === 0) return `No commits found for ${scope}.`;
  const more =
    commits.length === limit
      ? `\n\nShowing the newest ${limit}; raise limit or narrow since/until for older ones.`
      : "";
  return `${commits.length} commit${commits.length === 1 ? "" : "s"} for ${scope}, newest first:\n${commits.map(describeCommit).join("\n")}${more}`;
}
