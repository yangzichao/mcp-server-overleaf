import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitCommandError, runGitCommand } from "../../src/overleaf/gitCommandRunner.js";
import { waitForRecordedProcessId, writeHangingExecutable } from "../support/fakeExecutable.js";

const execFileAsync = promisify(execFile);
const token = "olp_test_token_not_a_real_secret";
// See writeHangingExecutable: the child must start before the timeout it is testing.
const HUNG_GIT_TIMEOUT_MS = 5000;

let workingDirectory: string;
const temporaryHomeDirectories: string[] = [];

const git = (args: string[], options: { tolerateFailure?: boolean; timeoutMs?: number } = {}) =>
  runGitCommand({ workingDirectory, args, overleafGitToken: token, ...options });

beforeEach(async () => {
  workingDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcp-git-"));
  await execFileAsync("git", ["init", "--initial-branch=main", workingDirectory]);
  await execFileAsync("git", ["config", "user.name", "Tester"], { cwd: workingDirectory });
  await execFileAsync("git", ["config", "user.email", "tester@example.com"], { cwd: workingDirectory });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(workingDirectory, { recursive: true, force: true });
  while (temporaryHomeDirectories.length > 0) {
    rmSync(temporaryHomeDirectories.pop() as string, { recursive: true, force: true });
  }
});

/**
 * A HOME whose `.gitconfig` holds the given lines. It has to sit outside the repository,
 * or `git add --all` would stage it.
 */
async function stubHomeWithGlobalGitConfiguration(
  buildConfiguration: (homeDirectory: string) => string,
): Promise<string> {
  const homeDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcp-home-"));
  temporaryHomeDirectories.push(homeDirectory);
  await writeFile(join(homeDirectory, ".gitconfig"), buildConfiguration(homeDirectory), "utf8");
  vi.stubEnv("HOME", homeDirectory);
  // Git reads this one first where it is set, so an inherited value would mask the test.
  vi.stubEnv("XDG_CONFIG_HOME", join(homeDirectory, ".config"));
  return homeDirectory;
}

async function commitOneFile(message: string): Promise<void> {
  await writeFile(join(workingDirectory, "a.tex"), "x", "utf8");
  await git(["add", "--all"]);
  await git(["commit", "-m", message]);
}

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
    const executableDirectory = join(workingDirectory, "bin");
    const processIdFile = join(workingDirectory, "hung-git.pid");
    await writeHangingExecutable(executableDirectory, "git", processIdFile);
    vi.stubEnv("PATH", executableDirectory);

    const startedAt = Date.now();
    const [error, childProcessId] = await Promise.all([
      git(["fetch", "origin"], { timeoutMs: HUNG_GIT_TIMEOUT_MS }).catch((caught: unknown) => caught),
      waitForRecordedProcessId(processIdFile, HUNG_GIT_TIMEOUT_MS),
    ]);

    expect(error).toBeInstanceOf(GitCommandError);
    // Both bounds matter. Without the lower one a child that died instantly for its own
    // reasons would satisfy this test without the timeout ever having been enforced.
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(HUNG_GIT_TIMEOUT_MS - 500);
    expect(elapsed).toBeLessThan(HUNG_GIT_TIMEOUT_MS + 4000);
    expect(() => process.kill(childProcessId, 0)).toThrow();
  }, 30_000);
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

/**
 * GIT_CONFIG_NOSYSTEM only silences /etc/gitconfig. The user's own ~/.gitconfig still
 * applies to every command this server runs, and two settings that are perfectly
 * reasonable for a human break the server: the commit inside push_changes fails to sign,
 * or a hook written for another repository refuses it.
 */
describe("not inheriting global git settings that would break a commit", () => {
  it("commits even when the user signs every commit globally", async () => {
    await stubHomeWithGlobalGitConfiguration(
      () => "[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = /nonexistent-gpg\n",
    );

    await commitOneFile("signed by nobody");
    expect((await git(["log", "--pretty=format:%s"])).stdout.trim()).toBe("signed by nobody");
  });

  it("commits without running hooks the user configured globally", async () => {
    const homeDirectory = await stubHomeWithGlobalGitConfiguration(
      (home) => `[core]\n\thooksPath = ${join(home, "hooks")}\n`,
    );
    const hookPath = join(homeDirectory, "hooks", "pre-commit");
    mkdirSync(join(homeDirectory, "hooks"));
    await writeFile(hookPath, "#!/bin/sh\necho refused by a global hook >&2\nexit 1\n", "utf8");
    chmodSync(hookPath, 0o755);

    await commitOneFile("no hook ran");
    expect((await git(["log", "--pretty=format:%s"])).stdout.trim()).toBe("no hook ran");
  });
});
