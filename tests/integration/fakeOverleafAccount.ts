import type { FakeOverleafRealtime } from "./fakeOverleafRealtime.js";
import { type FakeAnswer, jsonAnswer, NOT_FOUND } from "./fakeWebAnswers.js";

/**
 * The account-level web routes: the dashboard's project list, creating a project, compiling
 * and downloading output, and the source ZIP. Shapes follow `ProjectController`,
 * `CompileController` and `ClsiManager._parseOutputFiles`.
 */

export interface FakeAccountProject {
  _id: string;
  name: string;
  accessLevel: string;
  archived?: boolean;
  trashed?: boolean;
}

export interface RecordedCompile {
  readonly query: string;
  readonly body: Record<string, unknown>;
}

const BUILD_ID = "19a2b3c4d5e-f6a7b8c9d0e1f2a3";
const COMPILE_GROUP = "standard";
const CLSI_SERVER_ID = "clsi-fake-1";

export const FAKE_PDF_BYTES = Buffer.from("%PDF-1.5\n% a fake paper\n%%EOF\n");
export const FAKE_ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

export class FakeOverleafAccount {
  readonly projects: FakeAccountProject[];
  readonly compiles: RecordedCompile[] = [];
  readonly outputDownloads: string[] = [];
  /** The status the next compiles answer with, and whether they leave a PDF. */
  compileStatus = "success";
  producesPdf = true;
  compileLog = "This is pdfTeX, Version 3.141592653\n(./main.tex)\nOutput written on output.pdf (1 page).\n";
  /** What BibTeX left in output.blg; undefined when the compile ran no BibTeX. */
  bibliographyLog: string | undefined;
  /** The bibliography BibTeX wrote, output.bbl; undefined when the compile ran no BibTeX. */
  bibliography: string | undefined;
  /** output.synctex.gz; undefined when the compile produced none. */
  synctexBytes: Buffer | undefined;
  /** How many compiles to refuse as too recent before one is allowed. */
  refuseCompilesAsTooRecent = 0;
  private nextProjectNumber = 1;

  constructor(private readonly realtime: FakeOverleafRealtime) {
    this.projects = [
      { _id: realtime.projectId, name: realtime.projectName, accessLevel: "owner" },
      // An invited collaborator, which ProjectListController calls readWrite; link sharing is readAndWrite.
      { _id: "64b000000000000000000002", name: "Shared Thesis", accessLevel: "readWrite" },
      { _id: "64b000000000000000000003", name: "Grant Proposal", accessLevel: "readOnly" },
    ];
  }

  /** Answers the routes this class owns, or undefined to let the caller try others. */
  route(method: string, path: string, query: string, body: string): FakeAnswer | undefined {
    if (method === "GET" && path === "/user/projects") {
      // `userProjectsJson` leaves archived and trashed projects out and names only these fields.
      const listed = this.projects.filter((project) => !project.archived && !project.trashed);
      return jsonAnswer({
        projects: listed.map((project) => ({
          _id: project._id,
          name: project.name,
          accessLevel: project.accessLevel,
        })),
      });
    }
    if (method === "POST" && path === "/project/new") return this.createProject(body);

    const projectId = this.realtime.projectId;
    if (method === "POST" && path === `/project/${projectId}/compile`) return this.compile(query, body);
    if (method === "GET" && path === `/Project/${projectId}/download/zip`) {
      return { status: 200, contentType: "application/zip", body: FAKE_ZIP_BYTES };
    }
    const outputPrefix = `/project/${projectId}/user/${this.realtime.userId}/build/${BUILD_ID}/output/`;
    if (method === "GET" && path.startsWith(outputPrefix)) {
      return this.outputFile(path.slice(outputPrefix.length), query);
    }
    return undefined;
  }

  private createProject(body: string): FakeAnswer {
    const { projectName, template } = JSON.parse(body || "{}") as {
      projectName?: unknown;
      template?: unknown;
    };
    if (typeof projectName !== "string" || !projectName.trim()) {
      return {
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "invalid name" }),
      };
    }
    this.nextProjectNumber += 1;
    const projectId = `64c${String(this.nextProjectNumber).padStart(21, "0")}`;
    this.projects.push({
      _id: projectId,
      name: `${projectName.trim()}${template === "example" ? " (example)" : ""}`,
      accessLevel: "owner",
    });
    return jsonAnswer({ project_id: projectId, owner_ref: this.realtime.userId });
  }

  private compile(query: string, body: string): FakeAnswer {
    this.compiles.push({ query, body: JSON.parse(body || "{}") as Record<string, unknown> });
    if (this.refuseCompilesAsTooRecent > 0) {
      this.refuseCompilesAsTooRecent -= 1;
      return jsonAnswer({ status: "too-recently-compiled", outputFiles: [] });
    }
    const outputUrl = (file: string): string =>
      `/project/${this.realtime.projectId}/user/${this.realtime.userId}/build/${BUILD_ID}/output/${file}`;
    const outputFiles = [{ path: "output.log", url: outputUrl("output.log"), type: "log", build: BUILD_ID }];
    if (this.bibliographyLog !== undefined) {
      outputFiles.push({ path: "output.blg", url: outputUrl("output.blg"), type: "blg", build: BUILD_ID });
    }
    if (this.bibliography !== undefined) {
      outputFiles.push({ path: "output.bbl", url: outputUrl("output.bbl"), type: "bbl", build: BUILD_ID });
    }
    if (this.synctexBytes !== undefined) {
      outputFiles.push({
        path: "output.synctex.gz",
        url: outputUrl("output.synctex.gz"),
        type: "gz",
        build: BUILD_ID,
      });
    }
    if (this.producesPdf) {
      outputFiles.unshift({ path: "output.pdf", url: outputUrl("output.pdf"), type: "pdf", build: BUILD_ID });
    }
    return jsonAnswer({
      status: this.compileStatus,
      outputFiles,
      compileGroup: COMPILE_GROUP,
      clsiServerId: CLSI_SERVER_ID,
      pdfDownloadDomain: "https://compiles.example.invalid",
    });
  }

  private outputFile(file: string, query: string): FakeAnswer {
    const parameters = new URLSearchParams(query);
    // The real route needs these to find the compile server that holds the build.
    if (
      parameters.get("clsiserverid") !== CLSI_SERVER_ID ||
      parameters.get("compileGroup") !== COMPILE_GROUP
    ) {
      return NOT_FOUND;
    }
    this.outputDownloads.push(file);
    if (file === "output.pdf" && this.producesPdf) {
      return { status: 200, contentType: "application/pdf", body: FAKE_PDF_BYTES };
    }
    if (file === "output.log") return { status: 200, contentType: "text/plain", body: this.compileLog };
    if (file === "output.blg" && this.bibliographyLog !== undefined) {
      return { status: 200, contentType: "text/plain", body: this.bibliographyLog };
    }
    if (file === "output.bbl" && this.bibliography !== undefined) {
      return { status: 200, contentType: "text/plain", body: this.bibliography };
    }
    if (file === "output.synctex.gz" && this.synctexBytes !== undefined) {
      return { status: 200, contentType: "application/gzip", body: this.synctexBytes };
    }
    return NOT_FOUND;
  }
}
