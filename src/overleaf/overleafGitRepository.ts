import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertRealPathInsideRepository } from "./assertRealPathInsideRepository.js";
import { type GitCommandResult, runGitCommand } from "./gitCommandRunner.js";
import { resolvePathInsideRepository } from "./repositoryPaths.js";

/**
 * Junk that must never reach a co-author's project. Edits are committed with `git add
 * --all`, so anything the operating system or a stray local compile drops into the clone
 * would otherwise be published into someone's paper.
 *
 * This goes in `.git/info/exclude` rather than `.gitignore`, because `.gitignore` is a
 * tracked file and writing one would itself be a change pushed to Overleaf.
 */
const NEVER_PUBLISH_PATTERNS = [
  "# Written by mcp-server-overleaf. Local only; never pushed to Overleaf.",
  ".DS_Store",
  "Thumbs.db",
  "*.aux",
  "*.fdb_latexmk",
  "*.fls",
  "*.log",
  "*.out",
  "*.synctex.gz",
  "",
].join("\n");

export interface OverleafGitRepositoryOptions {
  readonly overleafProjectId: string;
  readonly repositoryDirectory: string;
  readonly overleafGitBaseUrl: string;
  readonly overleafGitToken: string;
  readonly commitAuthorName: string;
  readonly commitAuthorEmail: string;
}

export class DetachedHeadError extends Error {}

export class BinaryFileError extends Error {}

/** Enough of a file to catch a NUL byte in any real binary format. */
const BINARY_SNIFF_BYTES = 8192;

export interface RemoteDivergence {
  readonly branchName: string;
  readonly commitsOnlyOnRemote: number;
  readonly commitsOnlyOnLocal: number;
}

/**
 * A single Overleaf project clone.
 *
 * Overleaf's git bridge is not a general git remote: every project has exactly one
 * branch with one linear history, force pushes are refused, and there are no tags or
 * LFS. Everything here stays inside that envelope - fast-forward pulls, rebase onto
 * the remote branch, and ordinary pushes.
 */
export class OverleafGitRepository {
  constructor(private readonly options: OverleafGitRepositoryOptions) {}

  get repositoryDirectory(): string {
    return this.options.repositoryDirectory;
  }

  private get remoteUrl(): string {
    return `${this.options.overleafGitBaseUrl}/${this.options.overleafProjectId}`;
  }

  private git(
    args: readonly string[],
    options: { tolerateFailure?: boolean; timeoutMs?: number } = {},
  ): Promise<GitCommandResult> {
    return runGitCommand({
      workingDirectory: this.options.repositoryDirectory,
      args,
      overleafGitToken: this.options.overleafGitToken,
      ...options,
    });
  }

  private async directoryExists(path: string): Promise<boolean> {
    try {
      const entry = await stat(path);
      return entry.isDirectory();
    } catch {
      return false;
    }
  }

  /** Clones the project on first use; afterwards this is a cheap no-op. */
  async ensureCloned(): Promise<void> {
    if (await this.directoryExists(`${this.options.repositoryDirectory}/.git`)) {
      await this.git(["remote", "set-url", "origin", this.remoteUrl]);
      await this.writeLocalExcludes();
      return;
    }

    await mkdir(dirname(this.options.repositoryDirectory), { recursive: true });
    await runGitCommand({
      workingDirectory: dirname(this.options.repositoryDirectory),
      args: ["clone", this.remoteUrl, this.options.repositoryDirectory],
      overleafGitToken: this.options.overleafGitToken,
      timeoutMs: 300_000,
    });

    await this.git(["config", "user.name", this.options.commitAuthorName]);
    await this.git(["config", "user.email", this.options.commitAuthorEmail]);
    await this.writeLocalExcludes();
  }

  private async writeLocalExcludes(): Promise<void> {
    const excludePath = `${this.options.repositoryDirectory}/.git/info/exclude`;
    await mkdir(dirname(excludePath), { recursive: true });
    await writeFile(excludePath, NEVER_PUBLISH_PATTERNS, "utf8");
  }

  /** Overleaf hard-codes one branch: `main` for recent clones, `master` for older ones. */
  async getBranchName(): Promise<string> {
    const { stdout } = await this.git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const branchName = stdout.trim();

    // Detached HEAD reports the literal "HEAD". Left alone, every later command would
    // compare against a nonexistent `origin/HEAD` and quietly misreport the divergence,
    // which is the number the push decision rests on. Say so instead.
    if (branchName === "HEAD" || branchName === "") {
      throw new DetachedHeadError(
        `The clone at ${this.options.repositoryDirectory} is not on a branch. ` +
          "Overleaf projects have exactly one branch, so this clone was changed outside this server. " +
          "Delete the directory and let it be cloned again.",
      );
    }
    return branchName;
  }

  async getHeadCommitHash(): Promise<string> {
    const { stdout } = await this.git(["rev-parse", "HEAD"]);
    return stdout.trim();
  }

  async fetchRemote(): Promise<void> {
    await this.git(["fetch", "origin"], { timeoutMs: 180_000 });
  }

  /** How far the local clone and Overleaf have drifted apart, in commits. */
  async describeRemoteDivergence(): Promise<RemoteDivergence> {
    const branchName = await this.getBranchName();
    const { stdout } = await this.git(["rev-list", "--left-right", "--count", `origin/${branchName}...HEAD`]);
    const [remoteOnly = "0", localOnly = "0"] = stdout.trim().split(/\s+/);
    return {
      branchName,
      commitsOnlyOnRemote: Number.parseInt(remoteOnly, 10) || 0,
      commitsOnlyOnLocal: Number.parseInt(localOnly, 10) || 0,
    };
  }

  /** Replays local commits on top of whatever collaborators pushed. Aborts cleanly on conflict. */
  async rebaseOntoRemote(): Promise<{ succeeded: boolean; conflictReport: string }> {
    const branchName = await this.getBranchName();
    const result = await this.git(["rebase", `origin/${branchName}`], { tolerateFailure: true });
    const rebaseInProgress = await this.directoryExists(
      `${this.options.repositoryDirectory}/.git/rebase-merge`,
    );
    const rebaseApplyInProgress = await this.directoryExists(
      `${this.options.repositoryDirectory}/.git/rebase-apply`,
    );

    if (rebaseInProgress || rebaseApplyInProgress) {
      await this.git(["rebase", "--abort"], { tolerateFailure: true });
      return { succeeded: false, conflictReport: `${result.stdout}\n${result.stderr}`.trim() };
    }
    return { succeeded: true, conflictReport: "" };
  }

  async listTrackedFiles(): Promise<string[]> {
    const { stdout } = await this.git(["ls-files"]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  }

  /**
   * The single place a client-supplied path becomes an absolute one. Both halves of the
   * guard run here: path arithmetic first, then the symlink check, which needs the disk.
   */
  private async resolveClientPath(relativePath: string): Promise<string> {
    const absolutePath = resolvePathInsideRepository(this.options.repositoryDirectory, relativePath);
    await assertRealPathInsideRepository(this.options.repositoryDirectory, absolutePath);
    return absolutePath;
  }

  async readTextFile(relativePath: string): Promise<string> {
    const contents = await readFile(await this.resolveClientPath(relativePath));

    // Figures and PDFs decode to pages of mojibake that would go straight into the
    // model's context and tell it nothing. A NUL byte early on is the usual tell.
    if (contents.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
      throw new BinaryFileError(
        `${relativePath} is a binary file, not text, so there is nothing readable to return.`,
      );
    }
    return contents.toString("utf8");
  }

  async writeTextFile(relativePath: string, content: string): Promise<void> {
    const absolutePath = await this.resolveClientPath(relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }

  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const entry = await stat(await this.resolveClientPath(relativePath));
      return entry.isFile();
    } catch {
      return false;
    }
  }

  async getWorkingTreeStatus(): Promise<string[]> {
    const { stdout } = await this.git(["status", "--porcelain"]);
    return stdout
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line !== "");
  }

  async getUncommittedDiff(): Promise<string> {
    const { stdout } = await this.git(["diff", "HEAD", "--"]);
    return stdout;
  }

  async getDiffBetweenCommits(fromCommit: string, toCommit: string): Promise<string> {
    const { stdout } = await this.git(["diff", `${fromCommit}..${toCommit}`, "--"]);
    return stdout;
  }

  async stageAllAndCommit(commitMessage: string): Promise<{ committed: boolean; commitHash: string }> {
    await this.git(["add", "--all"]);
    const stagedChanges = await this.git(["diff", "--cached", "--name-only"]);
    if (stagedChanges.stdout.trim() === "") {
      return { committed: false, commitHash: await this.getHeadCommitHash() };
    }
    await this.git(["commit", "-m", commitMessage]);
    return { committed: true, commitHash: await this.getHeadCommitHash() };
  }

  /**
   * Returns the clone to what Overleaf currently holds, dropping unpushed commits as well
   * as uncommitted edits.
   *
   * Resetting to HEAD would not be enough. A refused push leaves its commit behind, so the
   * clone sits ahead of and behind Overleaf at once, and a later rebase conflicts on the
   * same lines forever. That is a dead end with no way out but deleting the directory.
   */
  async discardAllLocalChanges(): Promise<{ discardedCommits: number }> {
    await this.fetchRemote();
    const { commitsOnlyOnLocal } = await this.describeRemoteDivergence();
    const branchName = await this.getBranchName();

    await this.git(["reset", "--hard", `origin/${branchName}`]);
    await this.git(["clean", "-fd"]);
    return { discardedCommits: commitsOnlyOnLocal };
  }

  async pushToOverleaf(): Promise<{ succeeded: boolean; report: string }> {
    const branchName = await this.getBranchName();
    const result = await this.git(["push", "origin", `${branchName}:${branchName}`], {
      tolerateFailure: true,
      timeoutMs: 300_000,
    });
    const report = `${result.stdout}\n${result.stderr}`.trim();
    await this.fetchRemote();
    const divergence = await this.describeRemoteDivergence();
    return { succeeded: divergence.commitsOnlyOnLocal === 0, report };
  }

  async getRecentCommitLog(maxEntries: number): Promise<string> {
    const { stdout } = await this.git([
      "log",
      `--max-count=${maxEntries}`,
      "--date=iso",
      "--pretty=format:%h  %ad  %an  %s",
    ]);
    return stdout;
  }
}
