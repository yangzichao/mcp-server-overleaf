import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { EDITS_LOCAL_CLONE } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { describeByteSize } from "../web/saveDownloadedFile.js";
import { decodeBase64Upload, readLocalUpload } from "./readLocalUpload.js";

export function registerUploadFileTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "upload_file",
    {
      title: "Add a figure or other file to the project",
      description:
        "Add a file to the project byte for byte, such as a figure, a PDF, a data file or a .bib from elsewhere: copied from a path on this computer, or decoded from base64. write_file is for text written in the call itself. " +
        "The file goes into the local clone only; review it with show_diff and publish it with push_changes. An existing file at the same path is replaced. " +
        "Give exactly one of sourcePath and contentBase64. Files over 50 MB, and files under a hidden directory such as ~/.ssh, are refused. " +
        "Pulls from Overleaf first, and turns off text-only checkout for this project so the new file is committed with the rest. Returns the size written.",
      inputSchema: z.object({
        project: projectArgument,
        path: z
          .string()
          .describe(
            "Where the file goes in the project, relative to the project root, e.g. figures/plot.png.",
          ),
        sourcePath: z
          .string()
          .optional()
          .describe("Absolute path of the file on this computer to copy, e.g. /Users/me/results/plot.png."),
        contentBase64: z
          .string()
          .optional()
          .describe("The file's content, base64-encoded, for content that is not on disk."),
      }),
      annotations: EDITS_LOCAL_CLONE,
    },
    async ({ project, path, sourcePath, contentBase64 }) =>
      runToolSafely(context, async () => {
        if ((sourcePath === undefined) === (contentBase64 === undefined)) {
          throw new Error("Give exactly one of sourcePath and contentBase64.");
        }
        const bytes =
          sourcePath !== undefined
            ? await readLocalUpload(sourcePath)
            : decodeBase64Upload(contentBase64 ?? "");
        return await context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);
          // A text-only checkout would leave the new file outside the sparse patterns, where
          // `git add --all` skips it and the push silently goes without it.
          await repository.materializeAllFiles();
          const existedBefore = await repository.fileExists(path);
          await repository.writeFileBytes(path, bytes);
          return textResult(
            `${existedBefore ? "Replaced" : "Added"} ${path} (${describeByteSize(bytes.length)}) in the local clone. ` +
              "Review it with show_diff, then call push_changes to publish it to Overleaf.",
          );
        });
      }),
  );
}
