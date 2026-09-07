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

export interface GitCommandResult {
  readonly stdout: string;
  readonly stderr: string;
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

export async function runGitCommand(options: RunGitCommandOptions): Promise<GitCommandResult> {
  const { workingDirectory, args, overleafGitToken, timeoutMs = 120_000, tolerateFailure = false } = options;

  const gitArguments = [
    "-c",
    "credential.helper=",
    "-c",
    `credential.helper=${CREDENTIAL_HELPER_SHELL_SNIPPET}`,
    "-c",
    "core.askPass=",
    ...args,
  ];

  try {
    const { stdout, stderr } = await execFileAsync("git", gitArguments, {
      cwd: workingDirectory,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        OVERLEAF_GIT_TOKEN: overleafGitToken,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "",
        GIT_CONFIG_NOSYSTEM: "1",
        LC_ALL: "C",
      },
    });
    return {
      stdout: redactSecrets(stdout, [overleafGitToken]),
      stderr: redactSecrets(stderr, [overleafGitToken]),
    };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    const stdout = redactSecrets(failure.stdout ?? "", [overleafGitToken]);
    const stderr = redactSecrets(failure.stderr ?? "", [overleafGitToken]);
    if (tolerateFailure) {
      return { stdout, stderr };
    }
    // Redact the assembled message, not just the parts: `args` can itself carry the token,
    // for instance in a remote url, and this message is what reaches the model.
    const summary = failure.message ?? "git command failed";
    const message = redactSecrets(`git ${args.join(" ")} failed: ${summary}\n${stderr}`.trim(), [
      overleafGitToken,
    ]);
    throw new GitCommandError(message, stdout, stderr);
  }
}
