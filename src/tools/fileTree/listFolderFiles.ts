import type { OverleafProjectTree } from "../../overleaf/realtime/overleafProjectDocuments.js";

/** Every document and uploaded file below a folder, at any depth, sorted by path. */
export function listFolderFiles(tree: OverleafProjectTree, folderPath: string): string[] {
  const prefix = `${folderPath}/`;
  return [...tree.documents.map((document) => document.path), ...tree.binaryFiles.map((file) => file.path)]
    .filter((path) => path.startsWith(prefix))
    .sort();
}

/** True when the project's main document is the entity at path or lies below it. */
export function holdsMainDocument(tree: OverleafProjectTree, path: string): boolean {
  const main = tree.documents.find((document) => document.documentId === tree.rootDocumentId);
  return main !== undefined && (main.path === path || main.path.startsWith(`${path}/`));
}
