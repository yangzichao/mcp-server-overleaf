import type { OverleafProjectTree } from "../../overleaf/realtime/overleafProjectDocuments.js";
import { findTreeEntity, normaliseTreePath } from "../../overleaf/realtime/overleafTreeEntities.js";
import { checkEntityName } from "../../overleaf/web/files/entityNameRules.js";
import { createFolder } from "../../overleaf/web/files/projectFileTree.js";
import type { OverleafWebClient } from "../../overleaf/web/overleafWebClient.js";
import { describeEntityType } from "./describeTreeEntity.js";

export interface EnsuredFolder {
  readonly folderId: string;
  /** The folders this call created, parents first; empty when the folder was already there. */
  readonly createdPaths: readonly string[];
}

export function requireRootFolderId(tree: OverleafProjectTree): string {
  if (tree.rootFolderId) return tree.rootFolderId;
  throw new Error("Overleaf did not describe the project's root folder, so nothing was changed.");
}

/**
 * Refuses a folder path that runs through a document or an uploaded file, which nothing can be
 * put inside. Only the part of the path that exists can hold one, so this needs no request.
 */
export function requireFolderPathClear(tree: OverleafProjectTree, folderPath: string): void {
  let currentPath = "";
  for (const segment of normaliseTreePath(folderPath).split("/").filter(Boolean)) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const existing = findTreeEntity(tree, currentPath);
    if (!existing) return;
    if (existing.type !== "folder") {
      throw new Error(
        `${currentPath} is ${describeEntityType(existing.type)} in Overleaf, not a folder, so nothing can go inside it. Nothing was changed.`,
      );
    }
  }
}

/**
 * The folder at folderPath, creating it and every missing parent through the file tree, the way
 * the editor's "New folder" does one level at a time. Every name and the existing part of the
 * path are checked before the first folder is created, so a bad path never leaves half of itself
 * behind.
 */
export async function ensureOverleafFolder(
  client: OverleafWebClient,
  tree: OverleafProjectTree,
  folderPath: string,
): Promise<EnsuredFolder> {
  const segments = normaliseTreePath(folderPath).split("/").filter(Boolean);
  for (const segment of segments) checkEntityName(segment);
  requireFolderPathClear(tree, folderPath);
  let folderId = requireRootFolderId(tree);
  let currentPath = "";
  const createdPaths: string[] = [];
  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    // A folder created a moment ago is empty, so below it the tree has nothing to find.
    const existing = createdPaths.length === 0 ? findTreeEntity(tree, currentPath) : undefined;
    if (existing) {
      folderId = existing.id;
      continue;
    }
    folderId = await createFolder(client, tree.projectId, folderId, segment);
    createdPaths.push(currentPath);
  }
  return { folderId, createdPaths };
}
