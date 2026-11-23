import type { ProjectHistorySources } from "../projectHistory.js";
import { type BlameCommit, describeBlamedCommits } from "./blamedCommits.js";
import { parseBlamePorcelain, UNCOMMITTED_HASH_PATTERN } from "./parseBlamePorcelain.js";

export interface BlameRange {
  /** First line, counting from 1. Defaults to the first line of the file. */
  readonly startLine?: number;
  /** Last line, included. Defaults to the last line; a value past the end stops at the end. */
  readonly endLine?: number;
}

export interface BlameLine {
  readonly lineNumber: number;
  readonly text: string;
  /** Undefined for a line changed in the clone and not committed yet. */
  readonly commit: BlameCommit | undefined;
}

export interface FileBlame {
  readonly lines: readonly BlameLine[];
  /** True when the file is deleted in the clone; the lines are then its last committed version. */
  readonly deletedInClone: boolean;
}

/** A blame that cannot be given: no such file, no history yet, a binary file or a bad range. */
export class BlameRefusedError extends Error {}

const LINE_COUNT_PATTERN = /has only (\d+) lines?/;

function validateRange(range: BlameRange): void {
  for (const [name, value] of Object.entries(range)) {
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
      throw new BlameRefusedError(`${name} must be a whole number from 1, not ${value}.`);
    }
  }
  if (range.startLine !== undefined && range.endLine !== undefined && range.startLine > range.endLine) {
    throw new BlameRefusedError(`startLine ${range.startLine} is after endLine ${range.endLine}.`);
  }
}

function lineRangeArguments(range: BlameRange): string[] {
  if (range.startLine === undefined && range.endLine === undefined) return [];
  return ["-L", `${range.startLine ?? 1},${range.endLine ?? ""}`];
}

async function listsPath(sources: ProjectHistorySources, args: readonly string[], gitPath: string) {
  const { stdout } = await sources.git(["ls-files", "-z", ...args, "--", `:(literal)${gitPath}`]);
  return stdout.split("\0").some((entry) => entry !== "");
}

/** Refuses a path the last commit does not have, saying whether it is new or simply absent. */
async function assertCommitted(sources: ProjectHistorySources, relativePath: string, gitPath: string) {
  const inHead = await sources.git(["cat-file", "-e", `HEAD:${gitPath}`], { tolerateFailure: true });
  if (inHead.exitCode === 0) return;
  const existsInClone =
    (await listsPath(sources, [], gitPath)) || (await listsPath(sources, ["--others"], gitPath));
  throw new BlameRefusedError(
    existsInClone
      ? `${relativePath} has no history yet: it was created in the clone and not pushed, so every line is a local change.`
      : `No file ${relativePath} in this project's history. Check the path and its case.`,
  );
}

/** Git's own binary test, the one its diffs use: compare the file with an empty tree. */
async function assertText(sources: ProjectHistorySources, relativePath: string, gitPath: string) {
  const emptyTree = (await sources.git(["hash-object", "-t", "tree", "/dev/null"])).stdout.trim();
  const { stdout } = await sources.git([
    "diff",
    "--numstat",
    "--no-renames",
    "--no-ext-diff",
    "--no-textconv",
    emptyTree,
    "HEAD",
    "--",
    `:(literal)${gitPath}`,
  ]);
  if (stdout.startsWith("-\t-\t")) {
    throw new BlameRefusedError(`${relativePath} is a binary file; blame reads text files only.`);
  }
}

async function runBlame(
  sources: ProjectHistorySources,
  relativePath: string,
  gitPath: string,
  range: BlameRange,
): Promise<{ output: string; deletedInClone: boolean }> {
  // --no-ignore-revs-file: a global blame.ignoreRevsFile naming a file this project lacks
  // would otherwise make every blame fail.
  const blameArguments = ["blame", "--porcelain", "--no-ignore-revs-file", ...lineRangeArguments(range)];
  let result = await sources.git([...blameArguments, "--", gitPath], { tolerateFailure: true });
  let deletedInClone = false;
  // Missing from the working tree: deleted locally, or left out by a text-only checkout.
  if (result.exitCode !== 0 && result.stderr.includes("Cannot lstat")) {
    deletedInClone = await listsPath(sources, ["--deleted"], gitPath);
    result = await sources.git([...blameArguments, "HEAD", "--", gitPath], { tolerateFailure: true });
  }
  if (result.exitCode === 0) return { output: result.stdout, deletedInClone };
  const lineCount = LINE_COUNT_PATTERN.exec(result.stderr)?.[1];
  if (lineCount !== undefined) {
    throw new BlameRefusedError(
      `${relativePath} has only ${lineCount} lines, so line ${range.startLine ?? 1} is past the end.`,
    );
  }
  throw new Error(`Could not blame ${relativePath}: ${result.stderr.trim() || "git blame failed"}`);
}

/**
 * Who last changed each line of a file, and in which commit, as `git blame` reports it for
 * the file in the clone: a line edited here and not committed has no commit. A file deleted in
 * the clone is blamed as last committed. Blame follows the file through renames.
 */
export async function blameFile(
  sources: ProjectHistorySources,
  relativePath: string,
  range: BlameRange = {},
): Promise<FileBlame> {
  validateRange(range);
  const gitPath = await sources.toGitPath(relativePath);
  await assertCommitted(sources, relativePath, gitPath);
  await assertText(sources, relativePath, gitPath);
  const { output, deletedInClone } = await runBlame(sources, relativePath, gitPath, range);
  const porcelainLines = parseBlamePorcelain(output);
  const committedHashes = [...new Set(porcelainLines.map((line) => line.hash))].filter(
    (hash) => !UNCOMMITTED_HASH_PATTERN.test(hash),
  );
  const commits = await describeBlamedCommits(sources.git, committedHashes);
  return {
    lines: porcelainLines.map((line) => ({
      lineNumber: line.lineNumber,
      text: line.text,
      commit: commits.get(line.hash),
    })),
    deletedInClone,
  };
}
