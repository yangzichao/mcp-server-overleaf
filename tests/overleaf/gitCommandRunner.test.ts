import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitCommandError, runGitCommand } from "../../src/overleaf/gitCommandRunner.js";

const execFileAsync = promisify(execFile);
const token = "olp_test_token_not_a_real_secret";

let workingDirectory: string;

const git = (args: string[], options: { tolerateFailure?: boolean; timeoutMs?: number } = {}) =>
  runGitCommand({ workingDirectory, args, overleafGitToken: token, ...options });

beforeEach(async () => {
  workingDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcp-git-"));
  await execFileAsync("git", ["init", "--initial-branch=main", workingDirectory]);
  await execFileAsync("git", ["config", "user.name", "Tester"], { cwd: workingDirectory });
  await execFileAsync("git", ["config", "user.email", "tester@example.com"], { cwd: workingDirectory });
});

afterEach(() => {
  rmSync(workingDirectory, { recursive: true, force: true });
});

describe("running a command", () => {
  it("returns stdout", async () => {
    expect((await git(["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("main");
  });

  it("throws on failure, naming the command that failed", async () => {
    await expect(git(["rev-parse", "HEAD"])).rejects.toThrow(/git rev-parse HEAD failed/);
  });

  it("throws GitCommandError, carrying git's own output", async () => {
    const error = await git(["rev-parse", "HEAD"]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitCommandError);
    expect((error as GitCommandError).stderr).toContain("HEAD");
  });

  it("returns the failure instead of throwing when told to tolerate it", async () => {
    const result = await git(["rev-parse", "HEAD"], { tolerateFailure: true });
    expect(result.stderr).toContain("HEAD");
  });

  it("gives up rather than hanging when a command exceeds its timeout", async () => {
    // A fetch of an unreachable path fails fast; the point is that a timeout is honoured.
    await expect(
      git(["fetch", join(workingDirectory, "no-such-remote")], { timeoutMs: 30_000 }),
    ).rejects.toThrow(GitCommandError);
  });
});

describe("keeping the token out of everything that leaves the process", () => {
  /** Puts the token into git's own output, the way a bad remote url or error would. */
  async function commitWithTokenInTheMessage(): Promise<void> {
    await writeFile(join(workingDirectory, "a.tex"), "x", "utf8");
    await execFileAsync("git", ["add", "--all"], { cwd: workingDirectory });
    await execFileAsync("git", ["commit", "-m", `leak ${token} here`], { cwd: workingDirectory });
  }

  it("redacts the token out of stdout", async () => {
    await commitWithTokenInTheMessage();
    const { stdout } = await git(["log", "--pretty=format:%s"]);
    expect(stdout).not.toContain(token);
    expect(stdout).toContain("***REDACTED***");
  });

  it("redacts the token out of stderr on a tolerated failure", async () => {
    // A local path that is not a repository: git echoes the whole url back, no network needed.
    const { stderr } = await git(["fetch", `/nonexistent/${token}`], { tolerateFailure: true });
    expect(stderr).toContain("***REDACTED***");
    expect(stderr).not.toContain(token);
  });

  it("redacts the token out of a thrown error, including out of the arguments", async () => {
    const error = await git(["fetch", `/nonexistent/${token}`]).catch((caught: unknown) => caught);
    expect((error as Error).message).toContain("***REDACTED***");
    expect((error as Error).message).not.toContain(token);
  });

  it("never writes the token into .git/config", async () => {
    await git(["remote", "add", "origin", "https://git.example.com/64a1b2c3d4e5f6a7b8c9d0e1"]);
    expect(readFileSync(join(workingDirectory, ".git", "config"), "utf8")).not.toContain(token);
  });
});
