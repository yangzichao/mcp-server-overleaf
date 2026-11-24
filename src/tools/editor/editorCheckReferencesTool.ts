import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { checkProjectReferences } from "../../latex/references/checkProjectReferences.js";
import {
  CHECK_REFERENCES_FINDS,
  CHECK_REFERENCES_GUESSED_ROOT,
  CHECK_REFERENCES_RETURNS,
  CHECK_REFERENCES_SCOPE,
  CHECK_REFERENCES_TITLE,
} from "../latex/checkReferencesDescription.js";
import { chooseRootDocument } from "../latex/chooseRootDocument.js";
import { describeReferenceCheck } from "../latex/describeReferenceCheck.js";
import { createEditorProjectSourceReader } from "../latex/editorProjectSourceReader.js";
import { projectArgument } from "../projectArgument.js";
import { withReviewSession } from "../review/openReviewSession.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";
import { NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";
import { findMainDocumentPath } from "./editorProjectViews/editorFilesView.js";

const editorMainTexFileArgument = z
  .string()
  .optional()
  .describe(
    "Root document to start from, as a path in the project, e.g. main.tex. Omit to start from the main document set in Overleaf's menu, or from the likely main document when none is set.",
  );

/** check_references on a server with only a session cookie, reading every document from the editor. */
export function registerEditorCheckReferencesTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "check_references",
    {
      title: CHECK_REFERENCES_TITLE,
      description:
        CHECK_REFERENCES_FINDS +
        "Use it before a compile, and after renaming a label, a citation key or a figure. " +
        `The check starts at mainTexFile, or without it at the main document set in Overleaf's menu, or when none is set at ${CHECK_REFERENCES_GUESSED_ROOT}. ` +
        CHECK_REFERENCES_SCOPE +
        `${NO_GIT_BRIDGE_NOTE} Documents are read as the editor holds them now, with pending suggestions shown as if accepted, and an uploaded figure counts as present. ` +
        CHECK_REFERENCES_RETURNS,
      inputSchema: z.object({ project: projectArgument, mainTexFile: editorMainTexFileArgument }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, mainTexFile }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, async (session) => {
          const reader = createEditorProjectSourceReader(session);
          const requested = mainTexFile ?? findMainDocumentPath(session.project);
          const root = await chooseRootDocument(reader, reader.projectFiles, requested);
          const report = describeReferenceCheck(await checkProjectReferences(reader, root.path));
          return textResult(truncateForModel(root.warning ? `${report}\n\n${root.warning}` : report));
        }),
      ),
  );
}
