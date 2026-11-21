/**
 * The project tree Overleaf pushes on connection, reduced to what this server needs: a path
 * for every editable document, and the id the real-time service wants.
 *
 * The shape comes from `ProjectEditorHandler.buildProjectModelView` in `overleaf/overleaf`:
 * one root folder, each folder holding `folders`, `docs` and `fileRefs`. Only `docs` carry
 * text; `fileRefs` are uploaded binaries with no ranges and no operations.
 */

export interface OverleafDocumentEntry {
  /** Path relative to the project root, matching what the Git bridge calls the same file. */
  readonly path: string;
  readonly documentId: string;
}

export interface OverleafBinaryFileEntry {
  readonly path: string;
  readonly fileId: string;
}

export interface OverleafProjectTree {
  readonly projectId: string;
  readonly name: string;
  readonly rootDocumentId: string | undefined;
  readonly documents: readonly OverleafDocumentEntry[];
  readonly binaryFiles: readonly OverleafBinaryFileEntry[];
}

interface RawFolder {
  readonly name?: unknown;
  readonly folders?: unknown;
  readonly docs?: unknown;
  readonly fileRefs?: unknown;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function readTreeEntry(entry: unknown, parentPath: string): { path: string; id: string } | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const candidate = entry as { _id?: unknown; name?: unknown };
  const id = readString(candidate._id);
  const name = readString(candidate.name);
  if (!id || !name) return undefined;
  return { path: joinPath(parentPath, name), id };
}

interface CollectedEntries {
  readonly documents: OverleafDocumentEntry[];
  readonly binaryFiles: OverleafBinaryFileEntry[];
}

function readTreeEntries(entries: unknown, parentPath: string): { path: string; id: string }[] {
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => readTreeEntry(entry, parentPath) ?? []);
}

function collectEntries(folder: RawFolder, parentPath: string, collected: CollectedEntries): void {
  for (const { path, id } of readTreeEntries(folder.docs, parentPath)) {
    collected.documents.push({ path, documentId: id });
  }
  for (const { path, id } of readTreeEntries(folder.fileRefs, parentPath)) {
    collected.binaryFiles.push({ path, fileId: id });
  }
  for (const child of Array.isArray(folder.folders) ? folder.folders : []) {
    if (!child || typeof child !== "object") continue;
    const childFolder = child as RawFolder;
    const name = readString(childFolder.name);
    collectEntries(childFolder, name ? joinPath(parentPath, name) : parentPath, collected);
  }
}

/**
 * Returns undefined rather than throwing when the payload is not a project, so a surprising
 * response from a self-hosted instance surfaces as "Overleaf did not describe the project"
 * rather than as a type error from deep inside the connection.
 */
export function readProjectTree(payload: unknown): OverleafProjectTree | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const project = payload as {
    _id?: unknown;
    name?: unknown;
    rootDoc_id?: unknown;
    rootFolder?: unknown;
  };
  const projectId = readString(project._id);
  if (!projectId) return undefined;
  const rootFolders = Array.isArray(project.rootFolder) ? project.rootFolder : [];
  const collected: CollectedEntries = { documents: [], binaryFiles: [] };
  for (const folder of rootFolders) {
    // The root folder is named `rootFolder` and contributes no path segment of its own.
    if (folder && typeof folder === "object") collectEntries(folder as RawFolder, "", collected);
  }
  collected.documents.sort((left, right) => left.path.localeCompare(right.path));
  collected.binaryFiles.sort((left, right) => left.path.localeCompare(right.path));
  return {
    projectId,
    name: readString(project.name) ?? projectId,
    rootDocumentId: readString(project.rootDoc_id),
    documents: collected.documents,
    binaryFiles: collected.binaryFiles,
  };
}

/** Accepts either a path or a raw document id, because a caller may hold whichever is handier. */
export function findDocument(
  tree: OverleafProjectTree,
  pathOrDocumentId: string,
): OverleafDocumentEntry | undefined {
  const normalised = pathOrDocumentId.replace(/^\.?\//, "");
  return (
    tree.documents.find((document) => document.path === normalised) ??
    tree.documents.find((document) => document.documentId === pathOrDocumentId)
  );
}
