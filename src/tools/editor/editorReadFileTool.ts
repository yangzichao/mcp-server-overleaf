import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { findDocument } from "../../overleaf/realtime/overleafProjectDocuments.js";
import { projectArgument } from "../projectArgument.js";
import { numberLines } from "../reading/numberLines.js";
import { requireDocument, withReviewSession } from "../review/openReviewSession.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { editorPathArgument, NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";

export function registerEditorReadFileTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "read_file",
    {
      title: "Read a project file",
      description:
        "Read one text file as it stands in Overleaf's editor now, including edits co-authors have not finished. " +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "Plain calls return the text; with startLine or endLine the lines come back numbered, startLine alone reads to the end, and endLine is clamped to the file. " +
        "Text is cut off after 60,000 characters, so use a line range to sample a large file. " +
        "Fails for a path that is not an editable document, naming the ones that exist, and for a binary upload, which download_project_zip can fetch.",
      inputSchema: z.object({
        project: projectArgument,
        path: editorPathArgument,
        startLine: z.number().int().positive().optional().describe("First line to return, 1-indexed."),
        endLine: z.number().int().positive().optional().describe("Last line to return, inclusive."),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, path, startLine, endLine }) =>
      runToolSafely(context, () => {
        if (startLine !== undefined && endLine !== undefined && startLine > endLine) {
          throw new Error("startLine must not exceed endLine.");
        }
        return withReviewSession(context, project, async (session) => {
          const normalisedPath = path.replace(/^\.?\//, "");
          if (
            !findDocument(session.project, path) &&
            session.project.binaryFiles.some((file) => file.path === normalisedPath)
          ) {
            throw new Error(
              `${normalisedPath} is a binary upload, not text. download_project_zip saves the whole project, this file included.`,
            );
          }
          const document = requireDocument(session, path);
          const joined = await session.joinDocument(document.documentId);
          const content = joined.lines.join("\n");
          if (startLine === undefined && endLine === undefined) return textResult(truncateForModel(content));
          return textResult(truncateForModel(numberLines(content, startLine, endLine)));
        });
      }),
  );
}
