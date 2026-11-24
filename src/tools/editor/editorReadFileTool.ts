import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { projectArgument } from "../projectArgument.js";
import {
  assertWholeImageRead,
  IMAGE_READ_DESCRIPTION,
  isImageFilePath,
} from "../reading/images/imageFiles.js";
import {
  assertCompatibleReadArguments,
  endLineArgument,
  followIncludesArgument,
  SECTION_TITLE_DESCRIPTION,
  startLineArgument,
} from "../reading/readFileArguments.js";
import { withReviewSession } from "../review/openReviewSession.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext } from "../toolContext.js";
import { editorPathArgument, NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";
import { readFromEditor } from "./editorFileReads.js";

export function registerEditorReadFileTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "read_file",
    {
      title: "Read a project file",
      description:
        "Read one file as it stands in Overleaf's editor now, including edits co-authors have not finished. " +
        "Pending tracked changes read as if accepted: suggested insertions are in the text and suggested deletions are not; read_review (view tracked_changes) shows them. " +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "Plain calls return the text; with startLine or endLine the lines come back numbered, startLine alone reads to the end, and endLine is clamped to the file. " +
        "sectionTitle returns one section of a .tex file instead, from its heading to the next heading at the same or a shallower level, stopping before \\appendix, the bibliography or \\end{document}; it is compared case-insensitively, an exact match first, otherwise the first heading that contains it, and if nothing matches the reply lists the titles that exist. " +
        "followIncludes returns a .tex file with the files it includes inlined, to read a paper split across files in one call. " +
        "Text is cut off after 60,000 characters, so use a line range or a section to sample a large file. " +
        `${IMAGE_READ_DESCRIPTION} ` +
        "Fails for a path that is neither a document nor an upload, naming the documents that exist; for any other upload, which manage_project (action download_zip) can fetch, and a PDF or EPS figure is refused with the command that renders it to PNG; for sectionTitle combined with a line range; for followIncludes combined with any other read argument or on a file that is not .tex; and for startLine after endLine or past the last line.",
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
        followIncludes: followIncludesArgument,
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, ...read }) =>
      runToolSafely(context, () => {
        const { path, startLine, endLine, sectionTitle } = read;
        assertCompatibleReadArguments(read);
        if (isImageFilePath(path)) assertWholeImageRead(path, { startLine, endLine, sectionTitle });
        return withReviewSession(context, project, (session) => readFromEditor(context, session, read));
      }),
  );
}
