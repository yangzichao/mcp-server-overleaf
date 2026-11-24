import type { FakeOverleafRealtime } from "../fakeOverleafRealtime.js";
import {
  type FakeAnswer,
  FORBIDDEN,
  jsonAnswer,
  NO_CONTENT,
  plainTextAnswer,
  statusAnswer,
} from "../fakeWebAnswers.js";
import type { FakeProjectAccess } from "./fakeProjectAccess.js";
import type { FakeEntityType, FakeTreeFailure } from "./fakeProjectTree.js";
import {
  type FakeWebRequest,
  type FakeWebRoutes,
  matchPath,
  readJsonBody,
  readMultipartUpload,
} from "./fakeWebRequest.js";

/**
 * The editor's file-tree routes (`EditorRouter.mjs`, `UploadsRouter.mjs`, `FileStoreController`)
 * on the fake's project tree. Failures answer as `EditorHttpController` and `ErrorController`
 * do: a name of the wrong length is a bare 400, a taken name 400 "file already exists", an
 * unknown id 404, and upload refusals 422 with an `error` code.
 */

const TEXT_EXTENSIONS = /\.(tex|bib|txt|cls|sty|bst|md|bbx|cbx)$/i;
const FORBIDDEN_PRINTABLE_CHARACTERS = /[/\\*]/;

function hasForbiddenCharacter(name: string): boolean {
  return (
    FORBIDDEN_PRINTABLE_CHARACTERS.test(name) ||
    [...name].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0xd800 && code <= 0xdfff);
    })
  );
}

/** `_nameIsAcceptableLength` and `SafePath.isCleanFilename`, folded into the answer each gives. */
function nameProblem(name: unknown): FakeAnswer | undefined {
  if (typeof name !== "string" || name.length === 0 || name.length >= 150)
    return plainTextAnswer(400, "Bad Request");
  if (hasForbiddenCharacter(name) || name === "." || name === ".." || name !== name.trim()) {
    return plainTextAnswer(400, "invalid element name");
  }
  return undefined;
}

function failureAnswer(failure: FakeTreeFailure): FakeAnswer {
  if (failure === "not-found") return { status: 404, contentType: "text/plain", body: "Not Found" };
  if (failure === "duplicate") return plainTextAnswer(400, "file already exists");
  return plainTextAnswer(400, "destination folder is a child folder of me");
}

export class FakeFileTreeRoutes implements FakeWebRoutes {
  constructor(
    private readonly realtime: FakeOverleafRealtime,
    private readonly access: FakeProjectAccess,
  ) {}

  route(request: FakeWebRequest): FakeAnswer | Promise<FakeAnswer> | undefined {
    const prefix = `^/project/${this.realtime.projectId}`;
    const create = matchPath(request, "POST", new RegExp(`${prefix}/(doc|folder)$`, "i"));
    if (create?.[1]) return this.guarded(() => this.create(create[1] as "doc" | "folder", request));
    const action = matchPath(
      request,
      "POST",
      new RegExp(`${prefix}/(doc|file|folder)/([0-9a-f]{24})/(rename|move)$`, "i"),
    );
    if (action?.[1] && action[2] && action[3]) {
      const [, type, id, verb] = action;
      return this.guarded(() => this.renameOrMove(type as FakeEntityType, id, verb, request));
    }
    const removal = matchPath(
      request,
      "DELETE",
      new RegExp(`${prefix}/(doc|file|folder)/([0-9a-f]{24})$`, "i"),
    );
    if (removal?.[1] && removal[2]) {
      const [, type, id] = removal;
      return this.guarded(() => {
        const failure = this.realtime.tree.remove(type as FakeEntityType, id);
        return failure ? failureAnswer(failure) : NO_CONTENT;
      });
    }
    if (matchPath(request, "POST", new RegExp(`${prefix}/upload$`, "i"))) {
      return this.access.canWrite(this.realtime.projectId) ? this.upload(request) : FORBIDDEN;
    }
    const download = matchPath(request, "GET", new RegExp(`${prefix}/file/([0-9a-f]{24})$`, "i"));
    if (download?.[1]) return this.download(download[1]);
    return undefined;
  }

  private guarded(answer: () => FakeAnswer): FakeAnswer {
    return this.access.canWrite(this.realtime.projectId) ? answer() : FORBIDDEN;
  }

  private create(type: "doc" | "folder", request: FakeWebRequest): FakeAnswer {
    const body = readJsonBody(request);
    const problem = nameProblem(body.name);
    if (problem) return problem;
    const name = body.name as string;
    const parentFolderId =
      typeof body.parent_folder_id === "string" ? body.parent_folder_id : this.realtime.tree.rootFolderId;
    const created =
      type === "doc"
        ? this.realtime.tree.addDocument(parentFolderId, name)
        : this.realtime.tree.addFolder(parentFolderId, name);
    if (created === "not-found" || created === "duplicate" || created === "into-itself")
      return failureAnswer(created);
    return jsonAnswer(
      type === "doc" ? { _id: created, name } : { _id: created, name, docs: [], fileRefs: [], folders: [] },
    );
  }

  private renameOrMove(type: FakeEntityType, id: string, verb: string, request: FakeWebRequest): FakeAnswer {
    const body = readJsonBody(request);
    if (verb.toLowerCase() === "rename") {
      const problem = nameProblem(body.name);
      if (problem) return problem;
      const failure = this.realtime.tree.rename(type, id, body.name as string);
      return failure ? failureAnswer(failure) : NO_CONTENT;
    }
    if (typeof body.folder_id !== "string") return plainTextAnswer(400, "Bad Request");
    const failure = this.realtime.tree.move(type, id, body.folder_id);
    return failure ? failureAnswer(failure) : NO_CONTENT;
  }

  private async upload(request: FakeWebRequest): Promise<FakeAnswer> {
    const { fields, file } = await readMultipartUpload(request);
    const name = fields.get("name");
    if (!file) return statusAnswer(500, { success: false, error: "Upload failed" });
    if (!name || name.length > 150) return statusAnswer(422, { success: false, error: "invalid_filename" });
    let folderId = request.query.get("folder_id") ?? "";
    const folderPath = this.realtime.tree.folderPath(folderId);
    if (folderPath === undefined) return statusAnswer(422, { success: false, error: "folder_not_found" });
    const { tree } = this.realtime;
    if (tree.uploadsLeftBeforeFull !== undefined) {
      if (tree.uploadsLeftBeforeFull <= 0) {
        return statusAnswer(422, { success: false, error: "project_has_too_many_files" });
      }
      tree.uploadsLeftBeforeFull -= 1;
    }
    const relativePath = fields.get("relativePath");
    if (relativePath && relativePath !== "null") {
      const directory = relativePath.split("/").slice(0, -1).join("/");
      folderId = this.realtime.tree.ensureFolder(folderPath ? `${folderPath}/${directory}` : directory);
    }
    const entity = this.realtime.tree.upload(folderId, name, file, TEXT_EXTENSIONS.test(name));
    return jsonAnswer({ success: true, entity_id: entity.id, entity_type: entity.type, hash: "fake-hash" });
  }

  private download(fileId: string): FakeAnswer {
    if (!this.access.canRead(this.realtime.projectId)) return FORBIDDEN;
    const file = this.realtime.tree.files.get(fileId);
    if (!file) return { status: 404 };
    return { status: 200, contentType: "application/octet-stream", body: file.bytes };
  }
}
