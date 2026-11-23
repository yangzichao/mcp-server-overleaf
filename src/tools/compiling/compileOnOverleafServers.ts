import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ServerConfiguration } from "../../config/serverConfiguration.js";
import { compileOnOverleaf, downloadOutputFile, findOutputFile } from "../../overleaf/web/overleafCompile.js";
import { type ToolContext, type ToolTextResult, textResult, truncateForModel } from "../toolContext.js";
import { describeOverleafCompile } from "../web/describeOverleafCompile.js";
import { requireOverleafWebClient } from "../web/requireOverleafWebClient.js";
import { describeByteSize, PDF_DOWNLOAD, saveDownloadedFile } from "../web/saveDownloadedFile.js";

export interface OverleafCompileRequest {
  readonly project: string | undefined;
  readonly mainTexFile: string | undefined;
  readonly draft: boolean;
  readonly stopOnFirstError: boolean;
}

/**
 * Where an Overleaf compile's PDF and log are kept: this server's build cache, beside the
 * directory latexmk uses for the same project, and outside any clone so nothing is pushed.
 */
export function overleafOutputDirectory(
  configuration: ServerConfiguration,
  overleafProjectId: string,
): string {
  return join(configuration.workspaceDirectory, ".build", overleafProjectId, "overleaf");
}

/**
 * Compiles on Overleaf's servers and keeps output.pdf and output.log, replacing the ones an
 * earlier compile left, so the directory always holds the latest compile and nothing older.
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

  const downloadOutput = async (name: string): Promise<Buffer | undefined> => {
    const file = findOutputFile(result, name);
    return file ? await downloadOutputFile(webClient, result, file) : undefined;
  };
  const logBytes = await downloadOutput("output.log");
  // Present only when BibTeX or biber ran; it is the one place their errors appear.
  const bibliographyLog = (await downloadOutput("output.blg"))?.toString("utf8");
  const pdfBytes = await downloadOutput("output.pdf");

  const outputDirectory = overleafOutputDirectory(context.configuration, overleafProjectId);
  await mkdir(outputDirectory, { recursive: true });
  const pdfPath = join(outputDirectory, "output.pdf");
  const logPath = join(outputDirectory, "output.log");
  let savedPdf: { path: string; size: string } | undefined;
  if (pdfBytes) {
    savedPdf = {
      path: await saveDownloadedFile(pdfPath, pdfBytes, PDF_DOWNLOAD),
      size: describeByteSize(pdfBytes.length),
    };
  } else {
    await rm(pdfPath, { force: true });
  }
  if (logBytes) await writeFile(logPath, logBytes);
  else await rm(logPath, { force: true });

  const report = describeOverleafCompile({
    result,
    log: logBytes?.toString("utf8"),
    bibliographyLog,
    savedPdf,
    savedLogPath: logBytes ? logPath : undefined,
  });
  return textResult(truncateForModel(report));
}
