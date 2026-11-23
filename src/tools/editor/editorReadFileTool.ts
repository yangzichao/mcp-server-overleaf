import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { findDocument } from "../../overleaf/realtime/overleafProjectDocuments.js";
import { projectArgument } from "../projectArgument.js";
import { presentFileText } from "../reading/presentFileText.js";
import {
  assertCompatibleReadArguments,
  endLineArgument,
  SECTION_TITLE_DESCRIPTION,
  startLineArgument,
} from "../reading/readFileArguments.js";
import { requireDocument, withReviewSession } from "../review/openReviewSession.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { editorPathArgument, NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";

export function registerEditorReadFileTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "read_file",
    {
      title: "Read a project file",
      description:
        "Read one text file as it stands in Overleaf's editor now, including edits co-authors have not finished. " +
        "Pending tracked changes read as if accepted: suggested insertions are in the text and suggested deletions are not; read_review (view tracked_changes) shows them. " +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "Plain calls return the text; with startLine or endLine the lines come back numbered, startLine alone reads to the end, and endLine is clamped to the file. " +
        "sectionTitle returns one section of a .tex file instead, from its heading to the next heading at the same or a shallower level, stopping before \\appendix, the bibliography or \\end{document}; it is compared case-insensitively, an exact match first, otherwise the first heading that contains it, and if nothing matches the reply lists the titles that exist. " +
        "Text is cut off after 60,000 characters, so use a line range or a section to sample a large file. " +
        "Fails for a path that is not an editable document, naming the ones that exist; for a binary upload, which manage_project (action download_zip) can fetch; for sectionTitle combined with a line range; and for startLine after endLine.",
      inputSchema: z.object({
        project: projectArgument,
        path: editorPathArgument,
        startLine: startLineArgument.describe(
          "First line to return, 1-indexed. Cannot be combined with sectionTitle.",
        ),
        endLine: endLineArgument.describe(
          "Last line to return, inclusive. Cannot be combined with sectionTitle.",
        ),
        sectionTitle: z
          .string()
          .optional()
          .describe(
            `${SECTION_TITLE_DESCRIPTION} Cannot be combined with startLine or endLine; when nothing matches, the reply lists the titles that exist.`,
          ),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, path, startLine, endLine, sectionTitle }) =>
      runToolSafely(context, () => {
        assertCompatibleReadArguments({ startLine, endLine, sectionTitle });
        return withReviewSession(context, project, async (session) => {
          const normalisedPath = path.replace(/^\.?\//, "");
          if (
            !findDocument(session.project, path) &&
            session.project.binaryFiles.some((file) => file.path === normalisedPath)
          ) {
            throw new Error(
              `${normalisedPath} is a binary upload, not text. manage_project (action download_zip) saves the whole project, this file included.`,
            );
          }
          const document = requireDocument(session, path);
          const joined = await session.joinDocument(document.documentId);
          const content = joined.lines.join("\n");
          return textResult(presentFileText(document.path, content, { sectionTitle, startLine, endLine }));
        });
      }),
  );
}
