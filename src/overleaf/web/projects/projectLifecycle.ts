import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";
import { checkProjectName } from "./projectNameRules.js";

/**
 * Renaming, copying, archiving and trashing a project, the way the project list does them
 * (routes in `services/web/app/src/router.mjs`, handlers in `ProjectController.mjs`).
 *
 * Archiving and trashing belong to the signed-in account: `ProjectDeleter.archiveProject` and
 * `trashProject` add the user to the project's `archived` or `trashed` list, so a shared project
 * disappears from this account's list and nobody else's. Each one also takes the project out of
 * the other list. Deleting a project for good is left out on purpose.
 */

export interface CopiedProject {
  readonly projectId: string;
  readonly name: string;
}

/** `cloneProject` gives itself five minutes for a large project. */
const COPY_TIMEOUT_MS = 300_000;

/** Needs the owner: the route is behind `ensureUserCanAdminProject`. */
export async function renameProject(
  client: OverleafWebClient,
  projectId: string,
  newName: string,
): Promise<void> {
  const name = checkProjectName(newName);
  await client.postIgnoringAnswer(`/project/${requireOverleafId(projectId, "Project id")}/rename`, {
    newProjectName: name,
  });
}

/** Any account that can read the project can copy it; the copy belongs to this account. */
export async function copyProject(
  client: OverleafWebClient,
  projectId: string,
  newName: string,
): Promise<CopiedProject> {
  const name = checkProjectName(newName);
  const answer = (await client.postJson(
    `/Project/${requireOverleafId(projectId, "Project id")}/clone`,
    { projectName: name },
    { timeoutMs: COPY_TIMEOUT_MS },
  )) as { project_id?: unknown; name?: unknown } | undefined;
  if (typeof answer?.project_id !== "string") {
    throw new Error("Overleaf did not say which project the copy is. Check the project list in Overleaf.");
  }
  return { projectId: answer.project_id, name: typeof answer.name === "string" ? answer.name : name };
}

export async function setProjectArchived(
  client: OverleafWebClient,
  projectId: string,
  archived: boolean,
): Promise<void> {
  const path = `/Project/${requireOverleafId(projectId, "Project id")}/archive`;
  if (archived) await client.postIgnoringAnswer(path);
  else await client.delete(path);
}

export async function setProjectTrashed(
  client: OverleafWebClient,
  projectId: string,
  trashed: boolean,
): Promise<void> {
  const path = `/project/${requireOverleafId(projectId, "Project id")}/trash`;
  if (trashed) await client.postIgnoringAnswer(path);
  else await client.delete(path);
}
