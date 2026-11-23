import type { OverleafProjectTree } from "../../overleaf/realtime/overleafProjectDocuments.js";
import { baseNameOf, parentPathOf } from "../../overleaf/realtime/overleafTreeEntities.js";
import { checkEntityName } from "../../overleaf/web/files/entityNameRules.js";
import { createDocument } from "../../overleaf/web/files/projectFileTree.js";
import type { OverleafWebClient } from "../../overleaf/web/overleafWebClient.js";
import { ensureOverleafFolder } from "./ensureOverleafFolder.js";

export interface CreatedEditorDocument {
  readonly documentId: string;
  /** Parent folders that did not exist and were created first, outermost first. */
  readonly createdFolders: readonly string[];
}

/** An empty editable document at path, as the editor's "New file" makes one. */
export async function createEditorDocument(
  client: OverleafWebClient,
  tree: OverleafProjectTree,
  path: string,
): Promise<CreatedEditorDocument> {
  const name = checkEntityName(baseNameOf(path));
  const folder = await ensureOverleafFolder(client, tree, parentPathOf(path));
  const documentId = await createDocument(client, tree.projectId, folder.folderId, name);
  return { documentId, createdFolders: folder.createdPaths };
}
