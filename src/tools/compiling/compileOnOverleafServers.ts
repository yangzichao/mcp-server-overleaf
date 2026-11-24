import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ServerConfiguration } from "../../config/serverConfiguration.js";
import {
  type DownloadedCompileOutput,
  downloadCompileOutputs,
  KEPT_COMPILE_OUTPUTS,
} from "../../overleaf/web/compileOutputDownloads.js";
import { compileOnOverleaf } from "../../overleaf/web/overleafCompile.js";
import { type ToolContext, type ToolTextResult, textResult, truncateForModel } from "../toolContext.js";
import { describeOverleafCompile, type SavedCompileOutput } from "../web/describeOverleafCompile.js";
import { requireOverleafWebClient } from "../web/requireOverleafWebClient.js";
import { describeByteSize, PDF_DOWNLOAD, saveDownloadedFile } from "../web/saveDownloadedFile.js";

export interface OverleafCompileRequest {
  readonly project: string | undefined;
  readonly mainTexFile: string | undefined;
  readonly draft: boolean;
  readonly stopOnFirstError: boolean;
}

/**
 * Where an Overleaf compile's outputs are kept: this server's build cache, beside the
 * directory latexmk uses for the same project, and outside any clone so nothing is pushed.
 */
function overleafOutputDirectory(configuration: ServerConfiguration, overleafProjectId: string): string {
  return join(configuration.workspaceDirectory, ".build", overleafProjectId, "overleaf");
}

/**
 * Saves the outputs worth keeping and removes the ones this compile did not produce, so the
 * directory always holds the latest compile and nothing older. The PDF is never written over a
 * file that is not a PDF; the rest live only in this server's build cache.
 */
async function saveCompileOutputs(
  outputDirectory: string,
  downloads: readonly DownloadedCompileOutput[],
): Promise<SavedCompileOutput[]> {
  await mkdir(outputDirectory, { recursive: true });
  const downloaded = new Map(downloads.map((download) => [download.file.path, download.bytes]));
  const saved: SavedCompileOutput[] = [];
  for (const name of KEPT_COMPILE_OUTPUTS) {
    const target = join(outputDirectory, name);
    const bytes = downloaded.get(name);
    if (!bytes) {
      await rm(target, { force: true });
      continue;
    }
    if (name === "output.pdf") {
      saved.push({
        name,
        path: await saveDownloadedFile(target, bytes, PDF_DOWNLOAD),
        size: describeByteSize(bytes.length),
      });
    } else {
      await writeFile(target, bytes);
      saved.push({ name, path: target, size: describeByteSize(bytes.length) });
    }
  }
  return saved;
}

/**
 * Compiles on Overleaf's servers and keeps the PDF, the log, the bibliography BibTeX or Biber
 * wrote with its log, and the SyncTeX map, whichever of them the compile produced.
 */
export async function compileOnOverleafServers(
  context: ToolContext,
  request: OverleafCompileRequest,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const { overleafProjectId } = context.projectRegistry.resolveEditorProject(request.project);
  const result = await compileOnOverleaf(webClient, overleafProjectId, {
    rootResourcePath: request.mainTexFile,
    draft: request.draft,
    stopOnFirstError: request.stopOnFirstError,
  });

  const downloads = await downloadCompileOutputs(webClient, result);
  const textOf = (name: string): string | undefined =>
    downloads.find((download) => download.file.path === name)?.bytes.toString("utf8");
  const saved = await saveCompileOutputs(
    overleafOutputDirectory(context.configuration, overleafProjectId),
    downloads,
  );

  const report = describeOverleafCompile({
    result,
    log: textOf("output.log"),
    // Present only when BibTeX or Biber ran; it is the one place their errors appear.
    bibliographyLog: textOf("output.blg"),
    saved,
  });
  return textResult(truncateForModel(report));
}
