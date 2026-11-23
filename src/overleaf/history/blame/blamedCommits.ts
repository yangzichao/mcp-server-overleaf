import type { HistoryGitRunner } from "../projectHistory.js";

/** The commit a line was last changed in, in the same form the commit log reports commits. */
export interface BlameCommit {
  readonly hash: string;
  readonly shortHash: string;
  /** ISO 8601 with the author's offset, as `--date=iso-strict` prints it. */
  readonly date: string;
  readonly author: string;
  readonly subject: string;
}

const FIELD_SEPARATOR = "\u001f";

/** Keeps each `git show` command line short, well under Windows' 32K character limit. */
const HASHES_PER_COMMAND = 100;

/** Reads every commit once, however many lines it touched, with one `git show` per hundred. */
export async function describeBlamedCommits(
  git: HistoryGitRunner,
  hashes: readonly string[],
): Promise<Map<string, BlameCommit>> {
  const commits = new Map<string, BlameCommit>();
  for (let start = 0; start < hashes.length; start += HASHES_PER_COMMAND) {
    const { stdout } = await git([
      "show",
      "--no-patch",
      "--date=iso-strict",
      `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%s`,
      ...hashes.slice(start, start + HASHES_PER_COMMAND),
      "--",
    ]);
    for (const row of stdout.split("\n")) {
      const [hash, shortHash, date, author, ...subject] = row.split(FIELD_SEPARATOR);
      if (!hash || !shortHash || date === undefined) continue;
      commits.set(hash, {
        hash,
        shortHash,
        date,
        author: author ?? "",
        subject: subject.join(FIELD_SEPARATOR),
      });
    }
  }
  return commits;
}
