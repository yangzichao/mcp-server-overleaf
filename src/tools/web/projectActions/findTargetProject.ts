import { type AccountProject, fetchAccountProjects } from "../../../overleaf/web/accountProjects.js";
import type { OverleafWebClient } from "../../../overleaf/web/overleafWebClient.js";
import type { ToolContext } from "../../toolContext.js";

/**
 * The project a manage_project action works on, with its entry in this account's project list
 * so the reply can name it and the action can check its state first. The list asked for includes
 * archived and trashed projects, since unarchive and untrash act on exactly those.
 */

export interface TargetProject {
  readonly projectId: string;
  /** The quoted name from the account's list, or the id when the list does not have it. */
  readonly label: string;
  readonly address: string;
  readonly listed: AccountProject | undefined;
}

export async function findTargetProject(
  context: ToolContext,
  webClient: OverleafWebClient,
  project: string | undefined,
): Promise<TargetProject> {
  const { overleafProjectId } = context.projectRegistry.resolveEditorProject(project);
  const projects = await fetchAccountProjects(webClient, { includeArchived: true, includeTrashed: true });
  const listed = projects.find((candidate) => candidate.projectId === overleafProjectId);
  return {
    projectId: overleafProjectId,
    label: listed ? `"${listed.name}"` : `the project ${overleafProjectId}`,
    address: `${webClient.baseUrl}/project/${overleafProjectId}`,
    listed,
  };
}
