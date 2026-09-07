import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** A real subprocess with deterministic behavior, requiring no network or TeX install. */
export async function writeFakeExecutable(
  directory: string,
  name: string,
  javascript: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const executablePath = join(directory, name);
  await writeFile(executablePath, `#!${process.execPath}\n${javascript}\n`);
  await chmod(executablePath, 0o755);
}

/**
 * A subprocess that records its own process id and then hangs until something kills it,
 * for tests that a runner enforces its timeout instead of waiting forever.
 *
 * A shell script rather than a Node one, because the recording has to happen before the
 * runner's timeout fires and a Node interpreter takes far longer to start than `/bin/sh`.
 * `exec` keeps the recorded id, so the id a test reads is the process the runner has to
 * kill. PATH is reset inside the script because these tests narrow PATH to the directory
 * holding this very script; `sleep` would otherwise not be found, the child would exit
 * 127 immediately, and a timeout test would pass without any timeout being enforced.
 */
export async function writeHangingExecutable(
  directory: string,
  name: string,
  processIdFile: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const executablePath = join(directory, name);
  await writeFile(
    executablePath,
    ["#!/bin/sh", `printf '%s' "$$" > '${processIdFile}'`, "PATH=/bin:/usr/bin", "exec sleep 60", ""].join(
      "\n",
    ),
  );
  await chmod(executablePath, 0o755);
}

/**
 * Waits for writeHangingExecutable's child to record its id, so a test can talk about a
 * process it knows is running. Starting a freshly written executable is not something a
 * test can bound, so failing here is reported as what it is rather than surfacing later
 * as an unreadable id.
 */
export async function waitForRecordedProcessId(processIdFile: string, timeoutMs: number): Promise<number> {
  const giveUpAt = Date.now() + timeoutMs;
  for (;;) {
    const recorded = Number((await readFile(processIdFile, "utf8").catch(() => "")).trim());
    if (recorded > 0) return recorded;
    if (Date.now() >= giveUpAt) {
      throw new Error(
        `The hanging child never recorded its process id in ${processIdFile} within ${timeoutMs} ms, so it had not started yet.`,
      );
    }
    await new Promise((carryOn) => setTimeout(carryOn, 25));
  }
}
