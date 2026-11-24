import type { OverleafProjectTree } from "../../../../src/overleaf/realtime/overleafProjectDocuments.js";
import {
  findTreeEntity,
  type OverleafTreeEntity,
} from "../../../../src/overleaf/realtime/overleafTreeEntities.js";

/** What sits at `path`, failing the test when nothing does. */
export function requireTreeEntity(tree: OverleafProjectTree, path: string): OverleafTreeEntity {
  const entity = findTreeEntity(tree, path);
  if (!entity) throw new Error(`Nothing is at ${path} in the project tree.`);
  return entity;
}

export function requireRootFolderId(tree: OverleafProjectTree): string {
  if (!tree.rootFolderId) throw new Error("The project tree has no root folder id.");
  return tree.rootFolderId;
}
