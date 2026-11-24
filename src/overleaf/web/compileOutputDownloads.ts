import { type CompileOutputFile, downloadOutputFile, type OverleafCompileResult } from "./overleafCompile.js";
import type { OverleafWebClient } from "./overleafWebClient.js";

/**
 * The output files worth keeping from a compile on Overleaf: the PDF and log, the bibliography
 * BibTeX or Biber produced (`output.bbl`, which arXiv wants alongside the source) and its log,
 * and the SyncTeX map that ties PDF positions to source lines. A compile lists only what it
 * produced, so missing names are skipped rather than reported.
 */

export const KEPT_COMPILE_OUTPUTS = [
  "output.pdf",
  "output.log",
  "output.bbl",
  "output.blg",
  "output.synctex.gz",
];

export interface DownloadedCompileOutput {
  readonly file: CompileOutputFile;
  readonly bytes: Buffer;
}

export async function downloadCompileOutputs(
  client: OverleafWebClient,
  result: OverleafCompileResult,
  paths: readonly string[] = KEPT_COMPILE_OUTPUTS,
): Promise<DownloadedCompileOutput[]> {
  const files = result.outputFiles.filter((file) => paths.includes(file.path));
  const downloads: DownloadedCompileOutput[] = [];
  for (const file of files) downloads.push({ file, bytes: await downloadOutputFile(client, result, file) });
  return downloads;
}
