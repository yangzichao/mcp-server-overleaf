import type { OverleafProjectTree } from "./overleafProjectDocuments.js";

/**
 * Finding what sits at a path in the project tree, for the web routes that act on an entity by
 * type and id. Overleaf allows one entity per name in a folder whatever its type, so a path names
 * at most one document, uploaded file or folder. The empty path is the root folder.
 */

export type OverleafEntityType = "doc" | "file" | "folder";

export interface OverleafTreeEntity {
  readonly type: OverleafEntityType;
  readonly id: string;
  /** Relative to the project root; "" for the root folder. */
  readonly path: string;
}

export interface OverleafFolderLocation {
  readonly folderId: string;
  readonly path: string;
}

/** "./figures/plot.png", "/figures/plot.png/" and "figures//plot.png" all name figures/plot.png. */
export function normaliseTreePath(path: string): string {
  return path
    .replace(/^\.\//, "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
}

export function parentPathOf(path: string): string {
  const normalised = normaliseTreePath(path);
  const lastSlash = normalised.lastIndexOf("/");
  return lastSlash === -1 ? "" : normalised.slice(0, lastSlash);
}

export function baseNameOf(path: string): string {
  const normalised = normaliseTreePath(path);
  return normalised.slice(normalised.lastIndexOf("/") + 1);
}

export function findTreeEntity(tree: OverleafProjectTree, path: string): OverleafTreeEntity | undefined {
  const normalised = normaliseTreePath(path);
  if (normalised === "")
    return tree.rootFolderId ? { type: "folder", id: tree.rootFolderId, path: "" } : undefined;
  const document = tree.documents.find((entry) => entry.path === normalised);
  if (document) return { type: "doc", id: document.documentId, path: normalised };
  const binaryFile = tree.binaryFiles.find((entry) => entry.path === normalised);
  if (binaryFile) return { type: "file", id: binaryFile.fileId, path: normalised };
  const folder = tree.folders.find((entry) => entry.path === normalised);
  if (folder) return { type: "folder", id: folder.folderId, path: normalised };
  return undefined;
}

/** The folder at a path, or undefined when nothing, or something other than a folder, is there. */
export function findFolder(tree: OverleafProjectTree, path: string): OverleafFolderLocation | undefined {
  const entity = findTreeEntity(tree, path);
  return entity?.type === "folder" ? { folderId: entity.id, path: entity.path } : undefined;
}

/** The folder a new entity at `path` would go into, if that folder exists. */
export function findParentFolder(
  tree: OverleafProjectTree,
  path: string,
): OverleafFolderLocation | undefined {
  return findFolder(tree, parentPathOf(path));
}
