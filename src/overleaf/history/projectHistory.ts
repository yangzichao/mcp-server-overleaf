import type { GitCommandResult } from "../gitCommandRunner.js";
import { type BlameRange, blameFile, type FileBlame } from "./blame/blameFile.js";

/**
 * Read-only questions about a project's past, answered from the clone's Git history: which
 * commits there are, what a file said at one of them, and what changed between two.
 *
 * Revisions come from a model, so only commit hashes are accepted, and each is checked to be
 * a commit before use. Paths are validated by the repository and passed as `:(literal)`
 * pathspecs, so a name with `*` or a leading `:` is never read as pattern magic.
 */

export type HistoryGitRunner = (
  args: readonly string[],
  options?: { tolerateFailure?: boolean },
) => Promise<GitCommandResult>;

export interface ProjectHistorySources {
  readonly git: HistoryGitRunner;
  /** A client path, validated against the clone and turned into a Git path. */
  readonly toGitPath: (relativePath: string) => Promise<string>;
  /** The remote-tracking ref for what Overleaf held when last fetched. */
  readonly latestOverleafRevision: () => Promise<string>;
}

export interface ChangedFile {
  /** Git's status letter: A added, M modified, D deleted, R renamed, C copied. */
  readonly status: string;
  readonly path: string;
}

export interface CommitSummary {
  readonly hash: string;
  readonly shortHash: string;
  readonly date: string;
  readonly author: string;
  readonly subject: string;
  readonly changedFiles: readonly ChangedFile[];
}

export interface CommitQuery {
  readonly path?: string;
  readonly since?: string;
  readonly until?: string;
  readonly limit: number;
}

/** Hashes as list_history prints them, or in full. */
export const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/;

const RECORD_SEPARATOR = "\u001e";
const FIELD_SEPARATOR = "\u001f";

export class UnknownRevisionError extends Error {}

function parseChangedFiles(lines: readonly string[]): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of lines) {
    const [status, ...paths] = line.split("\t");
    // A rename lists the old and the new path; the new one is where the file is now.
    const path = paths.at(-1);
    if (status && path) files.push({ status: status.charAt(0), path });
  }
  return files;
}

export function parseCommitLog(output: string): CommitSummary[] {
  const commits: CommitSummary[] = [];
  for (const record of output.split(RECORD_SEPARATOR)) {
    const [header, ...fileLines] = record.split("\n");
    if (!header) continue;
    const [hash, shortHash, date, author, subject] = header.split(FIELD_SEPARATOR);
    if (!hash || !shortHash || date === undefined) continue;
    commits.push({
      hash,
      shortHash,
      date,
      author: author ?? "",
      subject: subject ?? "",
      changedFiles: parseChangedFiles(fileLines.filter((line) => line.trim() !== "")),
    });
  }
  return commits;
}

export class ProjectHistory {
  constructor(private readonly sources: ProjectHistorySources) {}

  async listCommits(query: CommitQuery): Promise<CommitSummary[]> {
    const args = [
      "log",
      `--max-count=${query.limit}`,
      "--date=iso-strict",
      `--pretty=format:${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%s`,
      "--name-status",
    ];
    if (query.since) args.push(`--since=${query.since}`);
    if (query.until) args.push(`--until=${query.until}`);
    args.push("HEAD", "--");
    if (query.path) args.push(`:(literal)${await this.sources.toGitPath(query.path)}`);
    const { stdout } = await this.sources.git(args);
    return parseCommitLog(stdout);
  }

  /** The commit a hash names, refusing anything that is not one. */
  async describeCommit(revision: string): Promise<CommitSummary> {
    const hash = await this.resolveCommit(revision);
    const { stdout } = await this.sources.git([
      "show",
      "--no-patch",
      "--date=iso-strict",
      `--pretty=format:${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%s`,
      hash,
    ]);
    const [commit] = parseCommitLog(stdout);
    if (!commit) throw new UnknownRevisionError(`Could not read commit ${revision}.`);
    return commit;
  }

  async readTextAt(revision: string, relativePath: string): Promise<string> {
    const hash = await this.resolveCommit(revision);
    const gitPath = await this.sources.toGitPath(relativePath);
    const result = await this.sources.git(["show", `${hash}:${gitPath}`], { tolerateFailure: true });
    if (result.exitCode !== 0) {
      throw new Error(
        `${relativePath} did not exist at revision ${revision}. list_history with this path shows when it did.`,
      );
    }
    if (result.stdout.slice(0, 8192).includes("\0")) {
      throw new Error(`${relativePath} was a binary file at revision ${revision}, not text.`);
    }
    return result.stdout;
  }

  async fileExistedAt(revision: string, relativePath: string): Promise<boolean> {
    const hash = await this.resolveCommit(revision);
    const gitPath = await this.sources.toGitPath(relativePath);
    const result = await this.sources.git(["cat-file", "-e", `${hash}:${gitPath}`], {
      tolerateFailure: true,
    });
    return result.exitCode === 0;
  }

  /** A unified diff; `toRevision` defaults to what Overleaf held when last fetched. */
  async diff(fromRevision: string, toRevision: string | undefined, relativePath?: string): Promise<string> {
    const from = await this.resolveCommit(fromRevision);
    const to = toRevision
      ? await this.resolveCommit(toRevision)
      : await this.sources.latestOverleafRevision();
    const args = ["diff", "--no-ext-diff", "--no-textconv", from, to, "--"];
    if (relativePath) args.push(`:(literal)${await this.sources.toGitPath(relativePath)}`);
    const { stdout } = await this.sources.git(args);
    return stdout;
  }

  /** Who last changed each line of a file in the clone, and in which commit. */
  blame(relativePath: string, range: BlameRange = {}): Promise<FileBlame> {
    return blameFile(this.sources, relativePath, range);
  }

  private async resolveCommit(revision: string): Promise<string> {
    if (!COMMIT_HASH_PATTERN.test(revision)) {
      throw new UnknownRevisionError(
        `"${revision}" is not a commit hash. Use a hash as list_history prints it, for example a1b2c3d.`,
      );
    }
    const result = await this.sources.git(["rev-parse", "--verify", "--quiet", `${revision}^{commit}`], {
      tolerateFailure: true,
    });
    const hash = result.stdout.trim();
    if (result.exitCode !== 0 || !hash) {
      throw new UnknownRevisionError(
        `No commit ${revision} in this project's history. list_history shows the revisions that exist.`,
      );
    }
    return hash;
  }
}
