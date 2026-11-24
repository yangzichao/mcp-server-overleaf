import type { FakeAccountProject, FakeOverleafAccount } from "../fakeOverleafAccount.js";
import type { FakeOverleafRealtime } from "../fakeOverleafRealtime.js";
import {
  type FakeAnswer,
  FORBIDDEN,
  jsonAnswer,
  PLAIN_OK,
  plainTextAnswer,
  statusAnswer,
} from "../fakeWebAnswers.js";
import type { FakeProjectAccess } from "./fakeProjectAccess.js";
import {
  type FakeWebRequest,
  type FakeWebRoutes,
  matchPath,
  readJsonBody,
  readMultipartUpload,
} from "./fakeWebRequest.js";

/**
 * Renaming, copying, archiving and trashing projects, the project list's `/api/project`, and a
 * new project from a ZIP, shaped like `ProjectController`, `ProjectListController` and
 * `ProjectUploadController`.
 */

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** `ProjectDetailsHandler.validateProjectName`, which `ErrorController` reports as plain text. */
function projectNameProblem(name: string): string | undefined {
  if (name.length === 0) return "Project name cannot be blank";
  if (name.length > 150) return "Project name is too long";
  if (name.includes("/")) return "Project name cannot contain / characters";
  if (name.includes("\\")) return "Project name cannot contain \\ characters";
  return undefined;
}

export class FakeProjectLifecycleRoutes implements FakeWebRoutes {
  /** Upload requests as multer saw them, for tests that check the form. */
  readonly projectUploads: Array<{ fields: Map<string, string>; size: number }> = [];
  /** Set by a test to refuse the next archive as `InvalidZipFileError` does, with this reason. */
  rejectNextProjectUpload: string | undefined;
  private nextCopyNumber = 0;

  constructor(
    private readonly realtime: FakeOverleafRealtime,
    private readonly account: FakeOverleafAccount,
    private readonly access: FakeProjectAccess,
  ) {}

  route(request: FakeWebRequest): FakeAnswer | Promise<FakeAnswer> | undefined {
    if (matchPath(request, "POST", /^\/api\/project$/)) return this.listProjects();
    if (matchPath(request, "POST", /^\/project\/new\/upload$/i)) return this.createFromZip(request);
    const rename = matchPath(request, "POST", /^\/project\/([0-9a-f]{24})\/rename$/i);
    if (rename?.[1]) return this.rename(rename[1], request);
    const clone = matchPath(request, "POST", /^\/project\/([0-9a-f]{24})\/clone$/i);
    if (clone?.[1]) return this.copy(clone[1], request);
    const flag = /^\/project\/([0-9a-f]{24})\/(archive|trash)$/i.exec(request.path);
    if (flag?.[1] && flag[2] && (request.method === "POST" || request.method === "DELETE")) {
      return this.setFlag(flag[1], flag[2].toLowerCase() as "archive" | "trash", request.method === "POST");
    }
    return undefined;
  }

  private find(projectId: string): FakeAccountProject | undefined {
    return this.account.projects.find((project) => project._id === projectId);
  }

  private listProjects(): FakeAnswer {
    const projects = this.account.projects.map((project) => ({
      id: project._id,
      name: project.name,
      // A project both archived and trashed counts as archived only, as `_formatProjectInfo` has it.
      archived: project.archived === true,
      trashed: project.trashed === true && project.archived !== true,
      accessLevel: project.accessLevel,
      source: project.accessLevel === "owner" ? "owner" : "invite",
      lastUpdated: "2026-11-01T12:00:00.000Z",
      lastUpdatedBy: null,
      owner: { id: this.realtime.userId, email: "you@example.com", firstName: "You", lastName: "Example" },
    }));
    return jsonAnswer({ totalSize: projects.length, projects });
  }

  private rename(projectId: string, request: FakeWebRequest): FakeAnswer {
    if (!this.access.isOwner(projectId)) return FORBIDDEN;
    const project = this.find(projectId);
    const newName = readJsonBody(request).newProjectName;
    if (!project || typeof newName !== "string") return plainTextAnswer(400, "Bad Request");
    const name = newName.trim();
    const problem = projectNameProblem(name);
    if (problem) return plainTextAnswer(400, problem);
    project.name = name;
    if (projectId === this.realtime.projectId) this.realtime.projectName = name;
    return PLAIN_OK;
  }

  private copy(projectId: string, request: FakeWebRequest): FakeAnswer {
    if (!this.access.canRead(projectId)) return FORBIDDEN;
    const source = this.find(projectId);
    const projectName = readJsonBody(request).projectName;
    if (!source) return FORBIDDEN;
    this.nextCopyNumber += 1;
    const copyId = `64d${String(this.nextCopyNumber).padStart(21, "0")}`;
    const name =
      typeof projectName === "string" && projectName.trim() ? projectName.trim() : `${source.name} (Copy)`;
    this.account.projects.push({ _id: copyId, name, accessLevel: "owner" });
    return jsonAnswer({
      name,
      lastUpdated: "2026-11-01T12:00:00.000Z",
      project_id: copyId,
      owner_ref: this.realtime.userId,
      owner: { first_name: "You", last_name: "Example", email: "you@example.com", _id: this.realtime.userId },
    });
  }

  /** `ProjectDeleter`: archiving takes the project out of the trash, and trashing out of the archive. */
  private setFlag(projectId: string, flag: "archive" | "trash", on: boolean): FakeAnswer {
    if (!this.access.canRead(projectId)) return FORBIDDEN;
    const project = this.find(projectId);
    if (!project) return FORBIDDEN;
    if (flag === "archive") {
      project.archived = on;
      if (on) project.trashed = false;
    } else {
      project.trashed = on;
      if (on) project.archived = false;
    }
    return PLAIN_OK;
  }

  private async createFromZip(request: FakeWebRequest): Promise<FakeAnswer> {
    const { fields, file } = await readMultipartUpload(request);
    this.projectUploads.push({ fields, size: file?.length ?? 0 });
    const name = fields.get("name");
    if (!file || !name) return statusAnswer(500, { success: false, error: "Upload failed" });
    if (!file.subarray(0, 4).equals(ZIP_SIGNATURE)) {
      return statusAnswer(422, { success: false, error: "Invalid zip file" });
    }
    const rejection = this.rejectNextProjectUpload;
    if (rejection !== undefined) {
      this.rejectNextProjectUpload = undefined;
      return statusAnswer(422, { success: false, error: rejection });
    }
    const projectName = name.endsWith(".zip") ? name.slice(0, -".zip".length) : name;
    this.nextCopyNumber += 1;
    const projectId = `64d${String(this.nextCopyNumber).padStart(21, "0")}`;
    this.account.projects.push({ _id: projectId, name: projectName, accessLevel: "owner" });
    return jsonAnswer({ success: true, project_id: projectId });
  }
}
