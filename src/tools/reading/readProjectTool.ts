import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { OverleafGitRepository } from "../../overleaf/overleafGitRepository.js";
import { runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { describeDocumentOutline } from "./projectViews/documentOutlineView.js";
import { describePendingChanges } from "./projectViews/pendingChangesView.js";
import { describeProjectFiles } from "./projectViews/projectFilesView.js";
import { describeProjectOverview } from "./projectViews/projectOverviewView.js";
import { describeSynchronizationStatus } from "./projectViews/synchronizationStatusView.js";

const PROJECT_VIEWS = ["overview", "files", "outline", "status", "changes"] as const;

const readProjectInput = z.object({
  project: projectArgument,
  view: z
    .enum(PROJECT_VIEWS)
    .default("overview")
    .describe(
      'What to read (default "overview"): overview (where to start), files (every path by kind), outline (sectioning commands), status (commits against Overleaf) or changes (the diff push_changes would publish).',
    ),
  extension: z
    .string()
    .regex(/^\.?[A-Za-z0-9]+$/)
    .optional()
    .describe(
      "files view only: keep paths ending in this extension, case-insensitively, e.g. tex or .bib. Omit to list all kinds.",
    ),
  includeUntracked: z
    .boolean()
    .optional()
    .describe(
      "files view only: also list files created locally and not yet pushed to Overleaf, marked (untracked), excluding ignored build artifacts (default false).",
    ),
  path: z
    .string()
    .optional()
    .describe(
      "outline view: the .tex file to outline, relative to the project root, default the likely main document. changes view: only this file or directory, default the whole project.",
    ),
  followIncludes: z
    .boolean()
    .optional()
    .describe(
      "outline view only: follow \\input, \\include, \\subfile and \\import from path, giving the whole document in reading order with each heading's own file and line numbers (default true); false lists only path's own headings.",
    ),
});

type ReadProjectInput = z.infer<typeof readProjectInput>;

export function registerReadProjectTool(server: McpServer, context: ToolContext): void {
  const inClone =
    (read: (repository: OverleafGitRepository, input: ReadProjectInput) => Promise<string>) =>
    (input: ReadProjectInput) =>
      context.projectRegistry.withRepository(input.project, async (repository) =>
        textResult(await read(repository, input)),
      );

  const views: Record<(typeof PROJECT_VIEWS)[number], ToolOperation<ReadProjectInput>> = {
    overview: { uses: [], run: inClone((repository) => describeProjectOverview(repository)) },
    files: {
      uses: ["extension", "includeUntracked"],
      run: inClone((repository, input) =>
        describeProjectFiles(repository, input.extension, input.includeUntracked ?? false),
      ),
    },
    outline: {
      uses: ["path", "followIncludes"],
      run: inClone((repository, input) =>
        describeDocumentOutline(repository, input.path, input.followIncludes ?? true),
      ),
    },
    status: { uses: [], run: inClone((repository) => describeSynchronizationStatus(repository)) },
    changes: {
      uses: ["path"],
      run: inClone((repository, input) => describePendingChanges(repository, input.path)),
    },
  };

  server.registerTool(
    "read_project",
    {
      title: "Read a project as a whole",
      description:
        "Read one project as a whole; view picks what. " +
        "overview, the default, orients at the start of a task: the absolute path of the local Git clone this server edits, the likely main document and its section count, file counts by kind, and local work not yet pushed. " +
        "files lists every path grouped by kind (LaTeX sources, bibliographies, figures, other), including files sparse checkout keeps off disk. " +
        "outline lists the sectioning commands of path, or of the likely main document, with nesting and line ranges, following \\input and \\include into the files it includes; commented-out headings are skipped. " +
        "status reports the clone against Overleaf: branch and head, commits just pulled, local commits not yet pushed, files edited but not committed, and the last ten commits. " +
        "changes shows the unified diff push_changes would publish: uncommitted edits, new and deleted files, and commits left behind by a refused push. " +
        "Use read_file for one file's text, search_project to find which file mentions something, and read_history for older versions. " +
        "The likely main document is a guess (main.tex, paper.tex, manuscript.tex, root.tex, thesis.tex or article.tex at the root, otherwise the shallowest .tex file), and the reply says when it has no \\begin{document}. " +
        "Every view except changes pulls from Overleaf first; if that pull conflicts with unpushed local work, the call fails and keeps the work, except in status, which reports the conflict as a WARNING. changes does not pull, so it compares against Overleaf as last fetched. " +
        "project can name any project the default token reaches, registered or not; the first call on a project clones it, so it is slower than later calls. " +
        'Returns plain text, cut off after 60,000 characters; "No local changes pending." means there is nothing to push.',
      inputSchema: readProjectInput,
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.view, views, input, ["project", "view"])),
  );
}
