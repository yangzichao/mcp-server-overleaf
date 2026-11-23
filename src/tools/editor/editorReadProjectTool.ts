import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { withReviewSession } from "../review/openReviewSession.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";
import { describeEditorFiles } from "./editorProjectViews/editorFilesView.js";
import { describeEditorOverview } from "./editorProjectViews/editorOverviewView.js";

const EDITOR_PROJECT_VIEWS = ["overview", "files"] as const;

const editorReadProjectInput = z.object({
  project: projectArgument,
  view: z
    .enum(EDITOR_PROJECT_VIEWS)
    .default("overview")
    .describe(
      'What to read (default "overview"): overview (name, main document, file counts, access) or files (every path by kind).',
    ),
  extension: z
    .string()
    .regex(/^\.?[A-Za-z0-9]+$/)
    .optional()
    .describe(
      "files view only: keep paths ending in this extension, case-insensitively, e.g. tex or .bib. Omit to list all kinds.",
    ),
});

type EditorReadProjectInput = z.infer<typeof editorReadProjectInput>;

export function registerEditorReadProjectTool(server: McpServer, context: ToolContext): void {
  const views: Record<(typeof EDITOR_PROJECT_VIEWS)[number], ToolOperation<EditorReadProjectInput>> = {
    overview: {
      uses: [],
      run: (input) =>
        withReviewSession(context, input.project, (session) =>
          Promise.resolve(textResult(describeEditorOverview(session))),
        ),
    },
    files: {
      uses: ["extension"],
      run: (input) =>
        withReviewSession(context, input.project, (session) =>
          Promise.resolve(textResult(describeEditorFiles(session.project, input.extension))),
        ),
    },
  };

  server.registerTool(
    "read_project",
    {
      title: "Read a project as a whole",
      description:
        "Read one project as Overleaf's editor holds it now; view picks what. " +
        "overview, the default, orients at the start of a task: the project's name, the main document set in Overleaf's menu, how many editable documents and binary uploads it has, and this account's access level. " +
        "files lists every file, grouped by kind (LaTeX sources, bibliographies, figures, other), marking uploads such as images (binary); read_file cannot read those, and manage_project (action download_zip) saves them with the rest of the project. " +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "Use it to find exact paths before read_file or edit_file. " +
        "A project the session cookie cannot open fails with the reason. " +
        "Returns plain text.",
      inputSchema: editorReadProjectInput,
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.view, views, input, ["project", "view"])),
  );
}
