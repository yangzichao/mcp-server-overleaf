import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type { FakeOverleafRealtime } from "../../../integration/fakeOverleafRealtime.js";

const execFileAsync = promisify(execFile);

const BOOKKEEPING_FIELDS = new Set([
  "requests",
  "compiles",
  "outputDownloads",
  "wordCountQueries",
  "projectUploads",
  "handshakeSessionIds",
  "nextHandshakeId",
]);

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

async function cloneStateAPushWouldPublish(clonePath: string): Promise<string> {
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
  readonly clonePath: string | undefined;
  readonly bareRepositoryDirectory: string;
  readonly editor: FakeOverleafRealtime;
}

export async function snapshotProjectState(sources: ProjectStateSources): Promise<Record<string, string>> {
  return {
    clone: sources.clonePath ? await cloneStateAPushWouldPublish(sources.clonePath) : "(no clone)",
    remote: await git(sources.bareRepositoryDirectory, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    editor: JSON.stringify(plainState(sources.editor, new Set())),
  };
}

function aroundFirstDifference(before: string, after: string): string {
  let index = 0;
  while (index < before.length && before[index] === after[index]) index += 1;
  const start = Math.max(0, index - 200);
  return `before: …${before.slice(start, index + 300)}…\nafter:  …${after.slice(start, index + 300)}…`;
}

export function describeStateChanges(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(before)
    .filter((part) => before[part] !== after[part])
    .map((part) => `${part} changed.\n${aroundFirstDifference(before[part] ?? "", after[part] ?? "")}`);
}
