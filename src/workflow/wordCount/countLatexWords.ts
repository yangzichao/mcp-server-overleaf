import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { relative } from "node:path";
import { promisify } from "node:util";

import { resolvePathInsideRepository } from "../../overleaf/repositoryPaths.js";
import { parseTexcountReport, type TexcountCounts, type TexcountReport } from "./parseTexcountReport.js";

const execFileAsync = promisify(execFile);

/** Overleaf gives texcount a minute for its Word Count menu. */
const DEFAULT_WORD_COUNT_TIMEOUT_MS = 60_000;

/** texcount is not installed, failed, ran out of time, or could not read the main file. */
export class WordCountFailedError extends Error {}

export interface LatexWordCount extends TexcountReport {
  readonly mainTexFile: string;
  readonly totals: TexcountCounts;
}

async function describeTexcountFailure(
  error: unknown,
  projectDirectory: string,
  timeoutMs: number,
): Promise<WordCountFailedError> {
  const failure = error as { code?: string | number; killed?: boolean; stdout?: string; stderr?: string };
  if (failure.code === "ENOENT") {
    // Node reports a missing working directory exactly like a missing program.
    const directoryExists = await stat(projectDirectory).then(
      (found) => found.isDirectory(),
      () => false,
    );
    if (!directoryExists) {
      return new WordCountFailedError(`The project directory ${projectDirectory} does not exist.`);
    }
    return new WordCountFailedError(
      "texcount was not found on PATH. It comes with TeX Live and MacTeX and needs Perl. On a smaller TeX Live install, add it with `tlmgr install texcount`; on Debian, it is in the texlive-extra-utils package.",
    );
  }
  if (failure.killed) {
    return new WordCountFailedError(`texcount did not finish within ${timeoutMs} ms.`);
  }
  const lastLines = `${failure.stderr ?? ""}\n${failure.stdout ?? ""}`
    .trim()
    .split("\n")
    .slice(-5)
    .join("\n");
  return new WordCountFailedError(
    `texcount failed (${failure.code ?? "unknown exit status"})${lastLines ? `: ${lastLines}` : "."}`,
  );
}

/**
 * Counts the words of a LaTeX document with texcount, run in the project directory with the
 * flags Overleaf's Word Count menu uses, `-nocol -inc`, so the numbers match that menu. Its
 * "Total Words" is `totals.wordsInText`.
 *
 * texcount reads included files from disk, so they must all be checked out. It follows \input
 * and \include, and \import, \subimport and \subfile in a document that loads the import or
 * subfiles package. An included file it cannot find is listed in `problems`, and the count goes
 * on without it.
 */
export async function countLatexWords(options: {
  projectDirectory: string;
  /** Relative to the project directory. */
  mainTexFile: string;
  timeoutMs?: number;
}): Promise<LatexWordCount> {
  const { projectDirectory, mainTexFile, timeoutMs = DEFAULT_WORD_COUNT_TIMEOUT_MS } = options;
  const mainFilePath = relative(projectDirectory, resolvePathInsideRepository(projectDirectory, mainTexFile));

  let output: string;
  try {
    // "./" so that a file name starting with a dash is not read as an option.
    const { stdout } = await execFileAsync("texcount", ["-nocol", "-inc", `./${mainFilePath}`], {
      cwd: projectDirectory,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
    output = stdout;
  } catch (error) {
    throw await describeTexcountFailure(error, projectDirectory, timeoutMs);
  }

  const report = parseTexcountReport(output);
  if (!report.totals) {
    const reasons = report.problems.length > 0 ? `: ${report.problems.join("; ")}` : ".";
    throw new WordCountFailedError(`texcount counted nothing in ${mainFilePath}${reasons}`);
  }
  return { ...report, mainTexFile: mainFilePath, totals: report.totals };
}
