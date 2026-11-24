import { stat } from "node:fs/promises";
import { basename, join } from "node:path";

function jobNameOf(mainTexFile: string): string {
  return basename(mainTexFile).replace(/\.tex$/i, "");
}

/** Where latexmk writes the PDF of a root document: the build directory, named after the job. */
export function compiledPdfPath(buildDirectory: string, mainTexFile: string): string {
  return join(buildDirectory, `${jobNameOf(mainTexFile)}.pdf`);
}

/** Where pdfLaTeX writes the SyncTeX map of that PDF when run with -synctex=1. */
export function compiledSynctexPath(buildDirectory: string, mainTexFile: string): string {
  return join(buildDirectory, `${jobNameOf(mainTexFile)}.synctex.gz`);
}

/** When the PDF was last written, or undefined when there is none yet. */
export async function readPdfModificationTime(pdfPath: string): Promise<number | undefined> {
  const found = await stat(pdfPath).catch(() => undefined);
  return found?.isFile() ? found.mtimeMs : undefined;
}

/**
 * The PDF latexmk left in the build directory, if it belongs to this run.
 *
 * After a successful run an older PDF is still current, because latexmk found nothing to redo.
 * After a failed run, a PDF this run did not write belongs to an earlier version of the paper,
 * so it is not reported as this compile's output.
 */
export async function findCompiledPdf(options: {
  pdfPath: string;
  modifiedAtMsBeforeCompile: number | undefined;
  succeeded: boolean;
}): Promise<string | undefined> {
  const modifiedAtMs = await readPdfModificationTime(options.pdfPath);
  if (modifiedAtMs === undefined) return undefined;
  if (!options.succeeded && modifiedAtMs === options.modifiedAtMsBeforeCompile) return undefined;
  return options.pdfPath;
}
