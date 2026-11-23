import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type { FakeOverleafRealtime } from "../../../integration/fakeOverleafRealtime.js";

const execFileAsync = promisify(execFile);

/**
 * Fields of the fakes that record requests or count connections, so a read changes them too.
 * Everything else in a fake is project state a read must leave alone.
 */
const BOOKKEEPING_FIELDS = new Set([
  "requests",
  "compiles",
  "outputDownloads",
  "wordCountQueries",
  "projectUploads",
  "handshakeSessionIds",
  "nextHandshakeId",
]);

/** A fake's state as plain data: maps, sets and objects walked, servers and functions left out. */
function plainState(value: unknown, seen: Set<object>): unknown {
  if (typeof value === "function") return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof EventEmitter) return undefined;
  if (seen.has(value)) return "(already listed)";
  seen.add(value);
  if (Buffer.isBuffer(value)) return createHash("sha256").update(value).digest("hex");
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return [...value.entries()].map(([key, item]) => [key, plainState(item, seen)]);
  if (value instanceof Set) return [...value].map((item) => plainState(item, seen));
  if (Array.isArray(value)) return value.map((item) => plainState(item, seen));
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !BOOKKEEPING_FIELDS.has(key))
      .map(([key, item]) => [key, plainState(item, seen)]),
  );
}

async function git(directory: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], { cwd: directory, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/**
 * What a user would call the clone's state: its commits and branches, what is staged, what is
 * edited and every untracked file's bytes. Which tracked files sparse checkout keeps on disk is
 * left out, because restoring one changes nothing a push would publish.
 */
async function cloneState(clonePath: string): Promise<string> {
  const status = await git(clonePath, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  const untrackedPaths = status
    .split("\0")
    .filter((entry) => entry.startsWith("?? "))
    .map((entry) => entry.slice(3));
  const untrackedHashes = await Promise.all(
    untrackedPaths.map(async (path) => {
      const bytes = await readFile(join(clonePath, path)).catch(() => Buffer.from("(unreadable)"));
      return `${path} ${createHash("sha256").update(bytes).digest("hex")}`;
    }),
  );
  return [
    await git(clonePath, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    await git(clonePath, ["rev-parse", "HEAD"]),
    status,
    await git(clonePath, ["diff", "--binary", "HEAD"]),
    await git(clonePath, ["diff", "--binary", "--cached"]),
    untrackedHashes.join("\n"),
  ].join("\n--\n");
}

export interface ProjectStateSources {
  /** Absent when the server has no Git credential and so keeps no clone. */
  readonly clonePath: string | undefined;
  readonly bareRepositoryDirectory: string;
  readonly editor: FakeOverleafRealtime;
}

/** Everything a tool could change: the clone, the Git remote, and the editor and web fakes. */
export async function snapshotProjectState(sources: ProjectStateSources): Promise<Record<string, string>> {
  return {
    clone: sources.clonePath ? await cloneState(sources.clonePath) : "(no clone)",
    remote: await git(sources.bareRepositoryDirectory, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    editor: JSON.stringify(plainState(sources.editor, new Set())),
  };
}

/** Where two texts first differ, with some text either side, so a long state stays readable. */
function aroundFirstDifference(before: string, after: string): string {
  let index = 0;
  while (index < before.length && before[index] === after[index]) index += 1;
  const start = Math.max(0, index - 200);
  return `before: …${before.slice(start, index + 300)}…\nafter:  …${after.slice(start, index + 300)}…`;
}

/** The parts of the state that differ, each shown where it first differs. */
export function describeStateChanges(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(before)
    .filter((part) => before[part] !== after[part])
    .map((part) => `${part} changed.\n${aroundFirstDifference(before[part] ?? "", after[part] ?? "")}`);
}
