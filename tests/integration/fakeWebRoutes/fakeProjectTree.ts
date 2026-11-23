/**
 * The fake project's folders and uploaded files, laid over the documents the real-time fake
 * keeps. Every entity is addressed by path, the way `ProjectEntityMongoUpdateHandler` checks
 * names: one entity per name in a folder, whatever its type. The tree is rebuilt for each
 * `joinProjectResponse`, so a change made through the web routes shows up on the next connection.
 */

export type FakeEntityType = "doc" | "file" | "folder";

export interface FakeTreeFile {
  readonly fileId: string;
  path: string;
  bytes: Buffer;
}

/** How the tree reaches the documents, which the real-time fake owns. */
export interface FakeTreeDocuments {
  documentPaths(): Array<{ documentId: string; path: string }>;
  createDocument(path: string, text: string): string;
  setDocumentPath(documentId: string, path: string): void;
  setDocumentText(documentId: string, text: string): void;
  deleteDocument(documentId: string): void;
}

export type FakeTreeFailure = "not-found" | "duplicate" | "into-itself";

export const FAKE_ROOT_FOLDER_ID = "64f000000000000000000f00";
const SECTIONS_FOLDER_ID = "64f000000000000000000f01";
const FIGURE_FILE_ID = "64f000000000000000000e01";
export const FAKE_FIGURE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function parentPathOf(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function isInside(path: string, folderPath: string): boolean {
  return path === folderPath || path.startsWith(`${folderPath}/`);
}

export class FakeProjectTree {
  readonly rootFolderId = FAKE_ROOT_FOLDER_ID;
  private readonly folderPaths = new Map<string, string>([[SECTIONS_FOLDER_ID, "sections"]]);
  readonly files = new Map<string, FakeTreeFile>([
    [FIGURE_FILE_ID, { fileId: FIGURE_FILE_ID, path: "figure.png", bytes: FAKE_FIGURE_BYTES }],
  ]);
  private nextEntityNumber = 0;

  constructor(private readonly documents: FakeTreeDocuments) {}

  newEntityId(): string {
    this.nextEntityNumber += 1;
    return `64e${this.nextEntityNumber.toString(16).padStart(21, "0")}`;
  }

  folderPath(folderId: string): string | undefined {
    return folderId === this.rootFolderId ? "" : this.folderPaths.get(folderId);
  }

  entityPath(type: FakeEntityType, id: string): string | undefined {
    if (type === "folder") return id === this.rootFolderId ? undefined : this.folderPaths.get(id);
    if (type === "file") return this.files.get(id)?.path;
    return this.documents.documentPaths().find((document) => document.documentId === id)?.path;
  }

  entityAt(path: string): { type: FakeEntityType; id: string } | undefined {
    const document = this.documents.documentPaths().find((entry) => entry.path === path);
    if (document) return { type: "doc", id: document.documentId };
    const file = [...this.files.values()].find((entry) => entry.path === path);
    if (file) return { type: "file", id: file.fileId };
    const folder = [...this.folderPaths].find(([, folderPath]) => folderPath === path);
    return folder ? { type: "folder", id: folder[0] } : undefined;
  }

  /** `mkdirp`: the id of the folder at `path`, creating it and its parents as needed. */
  ensureFolder(path: string): string {
    if (path === "") return this.rootFolderId;
    const existing = this.entityAt(path);
    if (existing?.type === "folder") return existing.id;
    this.ensureFolder(parentPathOf(path));
    const folderId = this.newEntityId();
    this.folderPaths.set(folderId, path);
    return folderId;
  }

  addFolder(parentFolderId: string, name: string): string | FakeTreeFailure {
    const path = this.newEntityPath(parentFolderId, name);
    if (path === "not-found" || path === "duplicate") return path;
    const folderId = this.newEntityId();
    this.folderPaths.set(folderId, path);
    return folderId;
  }

  addDocument(parentFolderId: string, name: string, text = ""): string | FakeTreeFailure {
    const path = this.newEntityPath(parentFolderId, name);
    if (path === "not-found" || path === "duplicate") return path;
    return this.documents.createDocument(path, text);
  }

  /**
   * An upload replaces whatever is already at the path, as `addEntity` with replace does: a
   * document keeps its id and takes the new text (`setDocument`), anything else is removed and the
   * upload gets a new id (`_replaceFile` swaps in a new file ref).
   */
  upload(
    folderId: string,
    name: string,
    bytes: Buffer,
    asDocument: boolean,
  ): { type: FakeEntityType; id: string } {
    const folderPath = this.folderPath(folderId) ?? "";
    const path = joinPath(folderPath, name);
    const existing = this.entityAt(path);
    if (asDocument) {
      if (existing?.type === "doc") {
        this.documents.setDocumentText(existing.id, bytes.toString("utf8"));
        return existing;
      }
      if (existing) this.remove(existing.type, existing.id);
      return { type: "doc", id: this.documents.createDocument(path, bytes.toString("utf8")) };
    }
    if (existing) this.remove(existing.type, existing.id);
    const fileId = this.newEntityId();
    this.files.set(fileId, { fileId, path, bytes });
    return { type: "file", id: fileId };
  }

  rename(type: FakeEntityType, id: string, newName: string): FakeTreeFailure | undefined {
    const path = this.entityPath(type, id);
    if (path === undefined) return "not-found";
    const newPath = joinPath(parentPathOf(path), newName);
    if (newPath === path) return undefined;
    if (this.entityAt(newPath)) return "duplicate";
    this.relocate(type, id, path, newPath);
    return undefined;
  }

  move(type: FakeEntityType, id: string, targetFolderId: string): FakeTreeFailure | undefined {
    const path = this.entityPath(type, id);
    const targetPath = this.folderPath(targetFolderId);
    if (path === undefined || targetPath === undefined) return "not-found";
    if (type === "folder" && isInside(targetPath, path)) return "into-itself";
    const newPath = joinPath(targetPath, baseNameOf(path));
    if (newPath === path) return undefined;
    if (this.entityAt(newPath)) return "duplicate";
    this.relocate(type, id, path, newPath);
    return undefined;
  }

  remove(type: FakeEntityType, id: string): FakeTreeFailure | undefined {
    const path = this.entityPath(type, id);
    if (path === undefined) return "not-found";
    if (type === "doc") this.documents.deleteDocument(id);
    if (type === "file") this.files.delete(id);
    if (type !== "folder") return undefined;
    for (const document of this.documents.documentPaths()) {
      if (isInside(document.path, path)) this.documents.deleteDocument(document.documentId);
    }
    for (const file of [...this.files.values()])
      if (isInside(file.path, path)) this.files.delete(file.fileId);
    for (const [folderId, folderPath] of [...this.folderPaths]) {
      if (isInside(folderPath, path)) this.folderPaths.delete(folderId);
    }
    return undefined;
  }

  /** The root folder as `ProjectEditorHandler.buildFolderModelView` would describe it. */
  buildRootFolder(): unknown {
    for (const document of this.documents.documentPaths()) this.ensureFolder(parentPathOf(document.path));
    return this.buildFolder(this.rootFolderId, "rootFolder", "");
  }

  private buildFolder(folderId: string, name: string, path: string): unknown {
    const childrenOf = <T extends { path: string }>(entries: T[]): T[] =>
      entries.filter((entry) => parentPathOf(entry.path) === path);
    const folders = childrenOf([...this.folderPaths].map(([id, folderPath]) => ({ id, path: folderPath })));
    return {
      _id: folderId,
      name,
      folders: folders.map((folder) => this.buildFolder(folder.id, baseNameOf(folder.path), folder.path)),
      fileRefs: childrenOf([...this.files.values()]).map((file) => ({
        _id: file.fileId,
        name: baseNameOf(file.path),
        created: "2026-11-01T12:00:00.000Z",
        hash: "0123456789abcdef0123456789abcdef01234567",
      })),
      docs: childrenOf(this.documents.documentPaths()).map((document) => ({
        _id: document.documentId,
        name: baseNameOf(document.path),
      })),
    };
  }

  private newEntityPath(parentFolderId: string, name: string): string | FakeTreeFailure {
    const parentPath = this.folderPath(parentFolderId);
    if (parentPath === undefined) return "not-found";
    const path = joinPath(parentPath, name);
    return this.entityAt(path) ? "duplicate" : path;
  }

  private relocate(type: FakeEntityType, id: string, oldPath: string, newPath: string): void {
    const rewrite = (path: string): string => newPath + path.slice(oldPath.length);
    if (type === "doc") this.documents.setDocumentPath(id, newPath);
    if (type === "file") {
      const file = this.files.get(id);
      if (file) file.path = newPath;
    }
    if (type !== "folder") return;
    for (const document of this.documents.documentPaths()) {
      if (isInside(document.path, oldPath))
        this.documents.setDocumentPath(document.documentId, rewrite(document.path));
    }
    for (const file of this.files.values()) if (isInside(file.path, oldPath)) file.path = rewrite(file.path);
    for (const [folderId, folderPath] of this.folderPaths) {
      if (isInside(folderPath, oldPath)) this.folderPaths.set(folderId, rewrite(folderPath));
    }
  }
}
