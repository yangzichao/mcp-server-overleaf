import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { describeProjectMembers } from "../reading/webProjectViews/projectMembersView.js";
import { describeOverleafWordCount } from "../reading/webProjectViews/projectWordCountView.js";
import {
  MEMBERS_VIEW_SENTENCE,
  WORD_COUNT_PATH_NOTE,
  WORD_COUNT_VIEW_SENTENCE,
} from "../reading/webProjectViews/webProjectViewDescriptions.js";
import { withReviewSession } from "../review/openReviewSession.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";
import { describeEditorFiles } from "./editorProjectViews/editorFilesView.js";
import { describeEditorOutline } from "./editorProjectViews/editorOutlineView.js";
import { describeEditorOverview } from "./editorProjectViews/editorOverviewView.js";

const EDITOR_PROJECT_VIEWS = ["overview", "files", "outline", "members", "word_count"] as const;

const editorReadProjectInput = z.object({
  project: projectArgument,
  view: z
    .enum(EDITOR_PROJECT_VIEWS)
    .default("overview")
    .describe(
      'What to read (default "overview"): overview (name, main document, settings, access), files (every path by kind), outline (sectioning commands), members (who the project is shared with) or word_count (Overleaf\'s word count).',
    ),
  extension: z
    .string()
    .regex(/^\.?[A-Za-z0-9]+$/)
    .optional()
    .describe(
      "files view only: keep paths ending in this extension, case-insensitively, e.g. tex or .bib. Omit to list all kinds.",
    ),
  path: z
    .string()
    .optional()
    .describe(
      `outline view: the .tex file to outline, relative to the project root, default the main document set in Overleaf's menu. ${WORD_COUNT_PATH_NOTE}`,
    ),
  followIncludes: z
    .boolean()
    .optional()
    .describe(
      "outline view only: follow \\input, \\include, \\subfile and \\import from path, giving the whole document in reading order with each heading's own file and line numbers (default true); false lists only path's own headings.",
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
    outline: {
      uses: ["path", "followIncludes"],
      run: (input) =>
        withReviewSession(context, input.project, async (session) =>
          textResult(await describeEditorOutline(session, input.path, input.followIncludes ?? true)),
        ),
    },
    members: {
      uses: [],
      run: async (input) => textResult(await describeProjectMembers(context, input.project)),
    },
    word_count: {
      uses: ["path"],
      run: async (input) => textResult(await describeOverleafWordCount(context, input.project, input.path)),
    },
  };

  server.registerTool(
    "read_project",
    {
      title: "Read a project as a whole",
      description:
        "Read one project as Overleaf's editor holds it now; view picks what. " +
        "overview, the default, orients at the start of a task: the project's name, the main document set in Overleaf's menu, how many editable documents and binary uploads it has, the compiler, TeX Live image and spell-check language, whether track changes is on and for whom, and this account's access level. " +
        "files lists every file, grouped by kind (LaTeX sources, bibliographies, figures, other), marking uploads such as images (binary); read_file cannot read those, and manage_project (action download_zip) saves them with the rest of the project. " +
        "outline lists the sectioning commands of path, or of the main document, with nesting and line ranges, following \\input and \\include into the files it includes unless followIncludes is false; commented-out headings are skipped, and pending suggestions are read as if accepted. " +
        `${MEMBERS_VIEW_SENTENCE} ` +
        `${WORD_COUNT_VIEW_SENTENCE} ` +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "Use it to find exact paths before read_file or edit_file. " +
        "A project the session cookie cannot open fails with the reason, and a path that does not exist fails and names the files that do. " +
        "Returns plain text; an outline is cut off after 60,000 characters.",
      inputSchema: editorReadProjectInput,
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.view, views, input, ["project", "view"])),
  );
}
