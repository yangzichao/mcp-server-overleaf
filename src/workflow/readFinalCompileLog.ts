import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * The log of the last LaTeX pass, and of the last BibTeX or biber run, from the build
 * directory.
 *
 * latexmk's own output strings every pass together. The first pass of a document with
 * citations always warns that each one is undefined, because the .aux file it reads does not
 * exist yet, so diagnostics read from that output report problems the final PDF does not have.
 * The .log file holds only the final pass.
 *
 * After a successful run, a log older than the run is still current: latexmk found nothing to
 * redo, so the last real pass compiled these same sources. After a failed run, an old log may
 * belong to an earlier version of the document, so only one written during this run is used.
 */

/** Filesystem timestamps can be coarser than a millisecond, so allow some slack. */
const TIMESTAMP_SLACK_MS = 2_000;

async function readIfCurrent(
  path: string,
  startedAtMs: number,
  succeeded: boolean,
): Promise<string | undefined> {
  try {
    const { mtimeMs } = await stat(path);
    if (!succeeded && mtimeMs < startedAtMs - TIMESTAMP_SLACK_MS) return undefined;
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

export async function readFinalCompileLog(options: {
  buildDirectory: string;
  mainTexFile: string;
  startedAtMs: number;
  succeeded: boolean;
}): Promise<string | undefined> {
  const { buildDirectory, mainTexFile, startedAtMs, succeeded } = options;
  const jobName = basename(mainTexFile).replace(/\.tex$/i, "");
  const log = await readIfCurrent(join(buildDirectory, `${jobName}.log`), startedAtMs, succeeded);
  if (log === undefined) return undefined;
  const bibliographyLog = await readIfCurrent(join(buildDirectory, `${jobName}.blg`), startedAtMs, succeeded);
  return bibliographyLog === undefined ? log : `${log}\n${bibliographyLog}`;
}
