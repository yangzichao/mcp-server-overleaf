import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { downloadProjectArchive } from "../../overleaf/web/projectArchive.js";
import { projectArgument } from "../projectArgument.js";
import { DOWNLOADS_FROM_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { requireOverleafWebClient } from "./requireOverleafWebClient.js";
import { describeByteSize, saveDownloadedFile, ZIP_DOWNLOAD } from "./saveDownloadedFile.js";

export function registerDownloadProjectZipTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "download_project_zip",
    {
      title: "Download the project as a ZIP",
      description:
        "Download the whole project from Overleaf as a ZIP archive, binary files included, as the editor's Download Source menu does, for archiving or for a submission system such as arXiv. " +
        "It holds what is in Overleaf now; local edits are included only after push_changes. " +
        "Returns the saved path and size.",
      inputSchema: z.object({
        project: projectArgument,
        saveTo: z
          .string()
          .describe(
            "Absolute path to save the archive to, ending in .zip, in a directory that exists. Replaces an existing ZIP there, never any other file.",
          ),
      }),
      annotations: DOWNLOADS_FROM_OVERLEAF,
    },
    async ({ project, saveTo }) =>
      runToolSafely(context, async () => {
        const webClient = requireOverleafWebClient(context);
        const { overleafProjectId } = context.projectRegistry.resolveEditorProject(project);
        const bytes = await downloadProjectArchive(webClient, overleafProjectId);
        const savedPath = await saveDownloadedFile(saveTo, bytes, ZIP_DOWNLOAD);
        return textResult(`Saved the project archive (${describeByteSize(bytes.length)}) to ${savedPath}.`);
      }),
  );
}
