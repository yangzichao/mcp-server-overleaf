import { requireOverleafId } from "../overleafIds.js";
import type { OverleafWebClient } from "../overleafWebClient.js";
import { checkEntityName } from "./entityNameRules.js";

/**
 * Creating, renaming, moving and deleting files and folders in a project as the editor's file
 * tree does, with no Git bridge involved. Routes are in `Features/Editor/EditorRouter.mjs`,
 * handlers in `EditorHttpController.mjs`; all need edit access. A new document or folder answers
 * with the entity (`res.json(doc)`); rename, move and delete answer 204. Overleaf refuses a name
 * already used in the target folder with 400 "file already exists", and pushes every change to
 * open editors at once, so co-authors see it immediately.
 */

type ProjectEntityType = "doc" | "file" | "folder";

export interface ProjectEntityReference {
  readonly type: ProjectEntityType;
  readonly id: string;
}

function readCreatedId(answer: unknown, what: string): string {
  const id = answer && typeof answer === "object" ? (answer as { _id?: unknown })._id : undefined;
  if (typeof id !== "string")
    throw new Error(`Overleaf did not say which ${what} it created. Check the project in Overleaf.`);
  return id;
}

function entityPath(projectId: string, entity: ProjectEntityReference): string {
  return `/project/${requireOverleafId(projectId, "Project id")}/${entity.type}/${requireOverleafId(entity.id, "Entity id")}`;
}

/** Answers with the new folder's id. */
export async function createFolder(
  client: OverleafWebClient,
  projectId: string,
  parentFolderId: string,
  name: string,
): Promise<string> {
  const answer = await client.postJson(`/project/${requireOverleafId(projectId, "Project id")}/folder`, {
    name: checkEntityName(name),
    parent_folder_id: requireOverleafId(parentFolderId, "Folder id"),
  });
  return readCreatedId(answer, "folder");
}

/** An empty document; answers with its id, which the real-time editor then opens. */
export async function createDocument(
  client: OverleafWebClient,
  projectId: string,
  parentFolderId: string,
  name: string,
): Promise<string> {
  const answer = await client.postJson(`/project/${requireOverleafId(projectId, "Project id")}/doc`, {
    name: checkEntityName(name),
    parent_folder_id: requireOverleafId(parentFolderId, "Folder id"),
  });
  return readCreatedId(answer, "document");
}

export async function renameEntity(
  client: OverleafWebClient,
  projectId: string,
  entity: ProjectEntityReference,
  newName: string,
): Promise<void> {
  await client.postJson(`${entityPath(projectId, entity)}/rename`, { name: checkEntityName(newName) });
}

export async function moveEntity(
  client: OverleafWebClient,
  projectId: string,
  entity: ProjectEntityReference,
  targetFolderId: string,
): Promise<void> {
  await client.postJson(`${entityPath(projectId, entity)}/move`, {
    folder_id: requireOverleafId(targetFolderId, "Folder id"),
  });
}

/** Deleting a folder deletes everything in it. */
export async function deleteEntity(
  client: OverleafWebClient,
  projectId: string,
  entity: ProjectEntityReference,
): Promise<void> {
  await client.delete(entityPath(projectId, entity));
}
