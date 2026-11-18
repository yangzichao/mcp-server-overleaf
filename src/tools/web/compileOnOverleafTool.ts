import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { compileOnOverleaf, downloadOutputFile, findOutputFile } from "../../overleaf/web/overleafCompile.js";
import { projectArgument } from "../projectArgument.js";
import { DOWNLOADS_FROM_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { describeOverleafCompile } from "./describeOverleafCompile.js";
import { requireOverleafWebClient } from "./requireOverleafWebClient.js";
import { describeByteSize, PDF_DOWNLOAD, saveDownloadedFile } from "./saveDownloadedFile.js";

export function registerCompileOnOverleafTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "compile_on_overleaf",
    {
      title: "Compile on Overleaf's servers",
      description:
        "Compile the project on Overleaf's own servers, exactly as the Recompile button does, and report the errors and warnings from the log. " +
        "It compiles what is in Overleaf now, so local edits count only after push_changes; compile_project compiles the local clone instead, and needs a TeX installation. " +
        "It uses the project's compiler and TeX Live version from Overleaf's settings, and the account's plan decides the time limit. " +
        "Pass savePdfTo to also download the PDF; without it nothing is written locally. " +
        "Returns a verdict line, then errors, then warnings, including BibTeX's and biber's from output.blg, then where the PDF was saved and which output files exist.",
      inputSchema: z.object({
        project: projectArgument,
        mainTexFile: z
          .string()
          .optional()
          .describe(
            "Root document to compile, as a path in the project. Omit to use the main document set in Overleaf's menu.",
          ),
        draft: z
          .boolean()
          .default(false)
          .describe("Draft mode: faster, with images replaced by boxes. Defaults to false."),
        stopOnFirstError: z
          .boolean()
          .default(false)
          .describe(
            "Stop at the first LaTeX error instead of carrying on to produce a PDF. Defaults to false, as in Overleaf.",
          ),
        savePdfTo: z
          .string()
          .optional()
          .describe(
            "Absolute path to save the PDF to, ending in .pdf, in a directory that exists. Replaces an existing PDF there, never any other file.",
          ),
      }),
      annotations: DOWNLOADS_FROM_OVERLEAF,
    },
    async ({ project, mainTexFile, draft, stopOnFirstError, savePdfTo }) =>
      runToolSafely(context, async () => {
        const webClient = requireOverleafWebClient(context);
        const { overleafProjectId } = context.projectRegistry.resolveProjectId(project);
        const result = await compileOnOverleaf(webClient, overleafProjectId, {
          rootResourcePath: mainTexFile,
          draft,
          stopOnFirstError,
        });

        const readTextOutput = async (name: string): Promise<string | undefined> => {
          const file = findOutputFile(result, name);
          return file ? (await downloadOutputFile(webClient, result, file)).toString("utf8") : undefined;
        };
        const log = await readTextOutput("output.log");
        // Present only when BibTeX or biber ran; it is the one place their errors appear.
        const bibliographyLog = await readTextOutput("output.blg");

        let savedPdf: { path: string; size: string } | undefined;
        const pdfFile = findOutputFile(result, "output.pdf");
        if (savePdfTo && pdfFile) {
          const bytes = await downloadOutputFile(webClient, result, pdfFile);
          savedPdf = {
            path: await saveDownloadedFile(savePdfTo, bytes, PDF_DOWNLOAD),
            size: describeByteSize(bytes.length),
          };
        }

        const report = describeOverleafCompile({ result, log, bibliographyLog, savedPdf });
        const pdfNote = savePdfTo && !pdfFile ? "\n\nNo PDF was produced, so nothing was saved." : "";
        return textResult(truncateForModel(`${report}${pdfNote}`));
      }),
  );
}
