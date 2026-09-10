import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * A bare repository standing in for a project on git.overleaf.com, plus a second clone
 * standing in for a co-author working in the Overleaf web editor.
 *
 * The real bridge cannot be used in tests: it needs a paid account, a live token, and it
 * would publish test commits into someone's paper. A bare repo reproduces everything the
 * safety contract actually depends on, which is fetch, rebase, and a rejected push.
 */
export class FakeOverleafRemote {
  private constructor(
    readonly rootDirectory: string,
    readonly projectId: string,
    readonly bareRepositoryDirectory: string,
    readonly collaboratorDirectory: string,
  ) {}

  static async create(projectId = "64a1b2c3d4e5f6a7b8c9d0e1"): Promise<FakeOverleafRemote> {
    const rootDirectory = mkdtempSync(join(tmpdir(), "overleaf-mcp-it-"));
    const bareRepositoryDirectory = join(rootDirectory, "overleaf", projectId);
    const collaboratorDirectory = join(rootDirectory, "collaborator");

    await mkdir(bareRepositoryDirectory, { recursive: true });
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", bareRepositoryDirectory]);

    const remote = new FakeOverleafRemote(
      rootDirectory,
      projectId,
      bareRepositoryDirectory,
      collaboratorDirectory,
    );
    await execFileAsync("git", ["clone", bareRepositoryDirectory, collaboratorDirectory]);
    await remote.configureIdentity(collaboratorDirectory, "A Collaborator", "collaborator@example.com");
    return remote;
  }

  private async configureIdentity(directory: string, name: string, email: string): Promise<void> {
    await execFileAsync("git", ["config", "user.name", name], { cwd: directory });
    await execFileAsync("git", ["config", "user.email", email], { cwd: directory });
  }

  /** The base url to hand the server, so `<base>/<projectId>` reaches the bare repo. */
  get gitBaseUrl(): string {
    return join(this.rootDirectory, "overleaf");
  }

  /** Where the server should keep its clones. */
  get workspaceDirectory(): string {
    return join(this.rootDirectory, "workspace");
  }

  /** Writes a file as the co-author and pushes it, the way the Overleaf editor would. */
  async collaboratorPushes(relativePath: string, content: string, message: string): Promise<void> {
    const absolutePath = join(this.collaboratorDirectory, relativePath);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
    await execFileAsync("git", ["add", "--all"], { cwd: this.collaboratorDirectory });
    await execFileAsync("git", ["commit", "-m", message], { cwd: this.collaboratorDirectory });
    await execFileAsync("git", ["push", "origin", "main"], { cwd: this.collaboratorDirectory });
  }

  /**
   * A second paper in the same account, reachable at the same base url.
   *
   * Needed to test what someone does after installing: the client is configured with one
   * project, and the other papers are addressed as they come up.
   */
  async addSiblingProject(projectId: string, relativePath: string, content: string): Promise<string> {
    const bareDirectory = join(this.gitBaseUrl, projectId);
    const authorDirectory = join(this.rootDirectory, `author-${projectId}`);
    await mkdir(bareDirectory, { recursive: true });
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", bareDirectory]);
    await execFileAsync("git", ["clone", bareDirectory, authorDirectory]);
    await this.configureIdentity(authorDirectory, "A Collaborator", "collaborator@example.com");
    await writeFile(join(authorDirectory, relativePath), content, "utf8");
    await execFileAsync("git", ["add", "--all"], { cwd: authorDirectory });
    await execFileAsync("git", ["commit", "-m", "Initial draft"], { cwd: authorDirectory });
    await execFileAsync("git", ["push", "origin", "main"], { cwd: authorDirectory });
    return projectId;
  }

  /** The content of a file as it currently stands "on Overleaf". */
  async readPublishedFile(relativePath: string): Promise<string> {
    const { stdout } = await execFileAsync("git", ["show", `main:${relativePath}`], {
      cwd: this.bareRepositoryDirectory,
    });
    return stdout;
  }

  async publishedCommitSubjects(): Promise<string[]> {
    const { stdout } = await execFileAsync("git", ["log", "--pretty=format:%s", "main"], {
      cwd: this.bareRepositoryDirectory,
    });
    return stdout.split("\n").filter((line) => line !== "");
  }

  /** The environment an MCP client would spawn the server with. */
  environment(): NodeJS.ProcessEnv {
    return {
      OVERLEAF_GIT_TOKEN: "olp_test_token_not_a_real_secret",
      OVERLEAF_PROJECTS: `paper=${this.projectId}`,
      OVERLEAF_GIT_BASE_URL: this.gitBaseUrl,
      OVERLEAF_MCP_WORKSPACE_DIR: this.workspaceDirectory,
    };
  }

  cleanUp(): void {
    rmSync(this.rootDirectory, { recursive: true, force: true });
  }
}
