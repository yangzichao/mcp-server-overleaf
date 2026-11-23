import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { redactSecrets } from "../config/secretRedaction.js";

const execFileAsync = promisify(execFile);

/**
 * Feeds the Overleaf token to git through a credential helper that reads it from
 * the child process environment. The token therefore never appears in argv (visible
 * to every process on the machine via `ps`) and is never written into `.git/config`.
 */
const CREDENTIAL_HELPER_SHELL_SNIPPET =
  '!f() { test "$1" = get && echo username=git && echo "password=$OVERLEAF_GIT_TOKEN"; }; f';

/**
 * Configuration this server must own rather than inherit.
 *
 * `GIT_CONFIG_NOSYSTEM` below only silences `/etc/gitconfig`; the user's own
 * `~/.gitconfig` still applies to every command we run. Two settings there break this
 * server outright. `commit.gpgsign=true` makes the commit inside push_changes fail with
 * "gpg failed to sign the data", or block on a passphrase prompt no MCP client can
 * answer. A global `core.hooksPath` runs someone's hooks against a clone they have never
 * seen, and a non-zero hook refuses the commit.
 *
 * The rest of the user's global configuration is deliberately left alone, because an
 * `http.proxy` or `url.*.insteadOf` they need to reach Overleaf at all also lives there.
 */
const OVERRIDDEN_GIT_CONFIGURATION = [
  "credential.helper=",
  `credential.helper=${CREDENTIAL_HELPER_SHELL_SNIPPET}`,
  "core.askPass=",
  "commit.gpgsign=false",
  "core.hooksPath=",
] as const;

export interface GitCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  /** Null means the process could not start or was terminated by a signal. */
  readonly exitCode: number | null;
}

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

export interface RunGitCommandOptions {
  readonly workingDirectory: string;
  readonly args: readonly string[];
  readonly overleafGitToken: string;
  readonly timeoutMs?: number;
  /** Return the failure instead of throwing, for commands where a non-zero exit is meaningful. */
  readonly tolerateFailure?: boolean;
}

function withOverriddenConfiguration(args: readonly string[]): string[] {
  return [...OVERRIDDEN_GIT_CONFIGURATION.flatMap((setting) => ["-c", setting]), ...args];
}

function gitEnvironment(overleafGitToken: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OVERLEAF_GIT_TOKEN: overleafGitToken,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    GIT_CONFIG_NOSYSTEM: "1",
    LC_ALL: "C",
  };
}

/**
 * Redact the assembled message, not just the parts: `args` can itself carry the token, for
 * instance in a remote url, and this message is what reaches the model. Git's stderr says what
 * went wrong. Node's summary repeats that stderr after the whole command line, -c overrides
 * and all, so it stands in only when git printed nothing, as when the command timed out.
 */
function gitCommandFailure(
  args: readonly string[],
  summary: string | undefined,
  stdout: string,
  stderr: string,
  overleafGitToken: string,
): GitCommandError {
  const detail = stderr.trim() || summary?.trim() || "git command failed";
  const message = redactSecrets(`git ${args.join(" ")} failed: ${detail}`, [overleafGitToken]);
  return new GitCommandError(message, stdout, stderr);
}

export async function runGitCommand(options: RunGitCommandOptions): Promise<GitCommandResult> {
  const { workingDirectory, args, overleafGitToken, timeoutMs = 120_000, tolerateFailure = false } = options;

  try {
    const { stdout, stderr } = await execFileAsync("git", withOverriddenConfiguration(args), {
      cwd: workingDirectory,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      env: gitEnvironment(overleafGitToken),
    });
    return {
      stdout: redactSecrets(stdout, [overleafGitToken]),
      stderr: redactSecrets(stderr, [overleafGitToken]),
      exitCode: 0,
    };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string; code?: number | string };
    const stdout = redactSecrets(failure.stdout ?? "", [overleafGitToken]);
    const stderr = redactSecrets(failure.stderr ?? "", [overleafGitToken]);
    if (tolerateFailure) {
      return { stdout, stderr, exitCode: typeof failure.code === "number" ? failure.code : null };
    }
    throw gitCommandFailure(args, failure.message, stdout, stderr, overleafGitToken);
  }
}

/**
 * Room above Overleaf's default upload limit of 50 MB, which is also projectFileDownload's
 * default cap. A larger blob fails with Git's buffer error instead of filling memory.
 */
const MAXIMUM_BLOB_BYTES = 64 * 1024 * 1024;

/**
 * stdout as bytes, for a blob such as a figure, which decoding as text would corrupt. Nothing
 * is redacted from the bytes, so this is only for commands whose output is file content.
 */
export async function runGitCommandForBytes(
  options: Omit<RunGitCommandOptions, "tolerateFailure">,
): Promise<Buffer> {
  const { workingDirectory, args, overleafGitToken, timeoutMs = 120_000 } = options;
  try {
    const { stdout } = await execFileAsync("git", withOverriddenConfiguration(args), {
      cwd: workingDirectory,
      timeout: timeoutMs,
      maxBuffer: MAXIMUM_BLOB_BYTES,
      env: gitEnvironment(overleafGitToken),
      encoding: "buffer",
    });
    return stdout;
  } catch (error) {
    const failure = error as { stderr?: Buffer | string; message?: string };
    const stderr = redactSecrets(String(failure.stderr ?? ""), [overleafGitToken]);
    throw gitCommandFailure(args, failure.message, "", stderr, overleafGitToken);
  }
}
