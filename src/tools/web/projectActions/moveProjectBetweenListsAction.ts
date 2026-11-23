import type { AccountProject } from "../../../overleaf/web/accountProjects.js";
import type { OverleafWebClient } from "../../../overleaf/web/overleafWebClient.js";
import { setProjectArchived, setProjectTrashed } from "../../../overleaf/web/projects/projectLifecycle.js";
import { type ToolContext, type ToolTextResult, textResult } from "../../toolContext.js";
import { requireOverleafWebClient } from "../requireOverleafWebClient.js";
import { findTargetProject } from "./findTargetProject.js";

/**
 * Archiving and trashing, and undoing either. Overleaf keeps both lists per account, so the
 * project moves in this account's dashboard only, and nothing is deleted. A project already where
 * the action would put it is left alone, so the reply never claims a change that did not happen.
 */

export const PROJECT_LIST_MOVES = ["archive", "unarchive", "trash", "untrash"] as const;
export type ProjectListMove = (typeof PROJECT_LIST_MOVES)[number];

interface ProjectListMoveRule {
  readonly isAlreadyThere: (project: AccountProject) => boolean;
  readonly send: (client: OverleafWebClient, projectId: string) => Promise<void>;
  readonly alreadyThere: (label: string) => string;
  readonly moved: (label: string) => string;
}

const UNCHANGED_FOR_OTHERS = "Co-authors' project lists do not change.";

const MOVE_RULES: Readonly<Record<ProjectListMove, ProjectListMoveRule>> = {
  archive: {
    isAlreadyThere: (project) => project.archived,
    send: (client, projectId) => setProjectArchived(client, projectId, true),
    alreadyThere: (label) => `${label} is already in this account's archive; nothing changed.`,
    moved: (label) =>
      `Archived ${label} for this account: it left the dashboard's main list for the Archived one (list_projects with filter archived), and unarchive brings it back. ${UNCHANGED_FOR_OTHERS}`,
  },
  unarchive: {
    isAlreadyThere: (project) => !project.archived,
    send: (client, projectId) => setProjectArchived(client, projectId, false),
    alreadyThere: (label) => `${label} is not in this account's archive; nothing changed.`,
    moved: (label) => `Took ${label} out of this account's archive; it is back in the dashboard's main list.`,
  },
  trash: {
    isAlreadyThere: (project) => project.trashed,
    send: (client, projectId) => setProjectTrashed(client, projectId, true),
    alreadyThere: (label) => `${label} is already in this account's trash; nothing changed.`,
    moved: (label) =>
      `Moved ${label} to this account's trash (list_projects with filter trashed); nothing was deleted, and untrash brings it back. ${UNCHANGED_FOR_OTHERS}`,
  },
  untrash: {
    isAlreadyThere: (project) => !project.trashed,
    send: (client, projectId) => setProjectTrashed(client, projectId, false),
    alreadyThere: (label) => `${label} is not in this account's trash; nothing changed.`,
    moved: (label) => `Took ${label} out of this account's trash; it is back in the dashboard's main list.`,
  },
};

export async function moveProjectBetweenListsAction(
  context: ToolContext,
  move: ProjectListMove,
  project: string | undefined,
): Promise<ToolTextResult> {
  const webClient = requireOverleafWebClient(context);
  const target = await findTargetProject(context, webClient, project);
  const rule = MOVE_RULES[move];
  if (target.listed && rule.isAlreadyThere(target.listed)) return textResult(rule.alreadyThere(target.label));
  await rule.send(webClient, target.projectId);
  return textResult(rule.moved(target.label));
}
