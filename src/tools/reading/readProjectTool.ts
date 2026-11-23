import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import type { OverleafGitRepository } from "../../overleaf/overleafGitRepository.js";
import { runSelectedOperation, type ToolOperation } from "../actions/toolOperations.js";
import type { OfferedToolGroups } from "../offeredToolGroups.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { describeDocumentOutline } from "./projectViews/documentOutlineView.js";
import { describePendingChanges } from "./projectViews/pendingChangesView.js";
import { describeProjectFiles } from "./projectViews/projectFilesView.js";
import { describeProjectOverview } from "./projectViews/projectOverviewView.js";
import { describeSynchronizationStatus } from "./projectViews/synchronizationStatusView.js";
import {
  describeReadProjectPathArgument,
  describeReadProjectTool,
  describeReadProjectViewArgument,
} from "./readProjectDescriptions.js";
import { describeProjectMembers } from "./webProjectViews/projectMembersView.js";
import { describeOverleafWordCount } from "./webProjectViews/projectWordCountView.js";

const CLONE_VIEWS = ["overview", "files", "outline", "status", "changes"] as const;
/** Read from Overleaf's web application, so listed only when the session cookie can serve them. */
const ACCOUNT_VIEWS = ["members", "word_count"] as const;

type ProjectViewName = (typeof CLONE_VIEWS)[number] | (typeof ACCOUNT_VIEWS)[number];
type ProjectViewNames = readonly [ProjectViewName, ...ProjectViewName[]];

function buildReadProjectInput(viewNames: ProjectViewNames, accountViewsOffered: boolean) {
  return z.object({
    project: projectArgument,
    view: z
      .enum(viewNames)
      .default("overview")
      .describe(describeReadProjectViewArgument(accountViewsOffered)),
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
    path: z.string().optional().describe(describeReadProjectPathArgument(accountViewsOffered)),
    followIncludes: z
      .boolean()
      .optional()
      .describe(
        "outline view only: follow \\input, \\include, \\subfile and \\import from path, giving the whole document in reading order with each heading's own file and line numbers (default true); false lists only path's own headings.",
      ),
  });
}

type ReadProjectInput = z.infer<ReturnType<typeof buildReadProjectInput>>;

export function registerReadProjectTool(
  server: McpServer,
  context: ToolContext,
  offered: OfferedToolGroups,
): void {
  const accountViewsOffered = offered.sessionCookieToolsOffered;
  const viewNames: ProjectViewNames = accountViewsOffered ? [...CLONE_VIEWS, ...ACCOUNT_VIEWS] : CLONE_VIEWS;

  const inClone =
    (read: (repository: OverleafGitRepository, input: ReadProjectInput) => Promise<string>) =>
    (input: ReadProjectInput) =>
      context.projectRegistry.withRepository(input.project, async (repository) =>
        textResult(await read(repository, input)),
      );

  const everyView: Record<ProjectViewName, ToolOperation<ReadProjectInput>> = {
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
    members: {
      uses: [],
      run: async (input) => textResult(await describeProjectMembers(context, input.project)),
    },
    word_count: {
      uses: ["path"],
      run: async (input) => textResult(await describeOverleafWordCount(context, input.project, input.path)),
    },
  };
  // Only the listed views, so an argument error never names a view this server does not offer.
  const views = Object.fromEntries(viewNames.map((name) => [name, everyView[name]])) as Record<
    ProjectViewName,
    ToolOperation<ReadProjectInput>
  >;

  server.registerTool(
    "read_project",
    {
      title: "Read a project as a whole",
      description: describeReadProjectTool(accountViewsOffered),
      inputSchema: buildReadProjectInput(viewNames, accountViewsOffered),
      annotations: READS_OVERLEAF,
    },
    (input) =>
      runToolSafely(context, () => runSelectedOperation(input.view, views, input, ["project", "view"])),
  );
}
