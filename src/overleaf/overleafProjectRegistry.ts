import { join } from "node:path";

import { looksLikeOverleafProjectId, type ServerConfiguration } from "../config/serverConfiguration.js";
import { OverleafGitRepository } from "./overleafGitRepository.js";
import { withProjectDirectoryLock } from "./projectDirectoryLock.js";

export class UnknownProjectError extends Error {}

/**
 * Maps the `project` tool argument onto a clone on disk.
 *
 * Callers may pass a name registered in OVERLEAF_PROJECTS, or a raw 24-character
 * Overleaf project id so a project can be used without editing the MCP client config.
 * Repositories are cached because cloning is the expensive part.
 */
export class OverleafProjectRegistry {
  /**
   * Keyed on project id and holding the in-flight promise, not the resolved repository:
   * an MCP client may issue several tool calls at once, and two concurrent misses would
   * otherwise clone into the same directory at the same time.
   */
  private readonly repositoryCache = new Map<string, Promise<OverleafGitRepository>>();

  private readonly projectLocks = new Map<string, Promise<void>>();

  constructor(private readonly configuration: ServerConfiguration) {}

  listRegisteredProjectNames(): string[] {
    return this.configuration.registeredProjects.map((project) => project.projectName);
  }

  private resolveProjectId(requestedProject: string | undefined): {
    projectName: string;
    overleafProjectId: string;
  } {
    const requested = requestedProject?.trim();

    if (!requested) {
      if (!this.configuration.defaultProjectName) {
        throw new UnknownProjectError(
          "No project given and no default is configured. Pass `project`, or set OVERLEAF_PROJECTS " +
            "to a single project, or set OVERLEAF_DEFAULT_PROJECT.",
        );
      }
      return this.resolveProjectId(this.configuration.defaultProjectName);
    }

    const registered = this.configuration.registeredProjects.find(
      (project) => project.projectName === requested,
    );
    if (registered) return registered;

    if (looksLikeOverleafProjectId(requested)) {
      return { projectName: requested, overleafProjectId: requested };
    }

    const knownNames = this.listRegisteredProjectNames();
    throw new UnknownProjectError(
      `Unknown project "${requested}". Configured projects: ${
        knownNames.length > 0 ? knownNames.join(", ") : "(none)"
      }. You can also pass a 24-character Overleaf project id directly.`,
    );
  }

  /**
   * Runs `action` with the project's clone, serialized against every other call for the
   * same project.
   *
   * MCP clients may issue several tool calls at once. Two concurrent edits to one file
   * would otherwise both read the old text and both write, silently dropping one of them -
   * exactly the lost work this server exists to prevent. Different projects still run
   * in parallel, since they are separate clones.
   */
  async withRepository<T>(
    requestedProject: string | undefined,
    action: (repository: OverleafGitRepository) => Promise<T>,
  ): Promise<T> {
    const { overleafProjectId } = this.resolveProjectId(requestedProject);
    const previous = this.projectLocks.get(overleafProjectId) ?? Promise.resolve();

    // Nested inside the in-process queue on purpose: this process never contends with
    // itself for the on-disk lock, so only genuinely separate processes ever wait. The
    // clone is inside the lock too, or two processes starting at once would both clone
    // into the same directory.
    const running = previous.then(() =>
      withProjectDirectoryLock(this.lockDirectoryFor(overleafProjectId), async () =>
        action(await this.openRepository(requestedProject)),
      ),
    );
    // The queue must survive a failed action, or one error would wedge the project forever.
    this.projectLocks.set(
      overleafProjectId,
      running.then(
        () => undefined,
        () => undefined,
      ),
    );
    return await running;
  }

  private lockDirectoryFor(overleafProjectId: string): string {
    return join(this.configuration.workspaceDirectory, ".locks", `${overleafProjectId}.lock`);
  }

  // Deliberately async: resolveProjectId throws, and a method that returns a Promise must
  // reject rather than throw synchronously, or callers' .catch() misses it.
  async openRepository(requestedProject: string | undefined): Promise<OverleafGitRepository> {
    const { overleafProjectId } = this.resolveProjectId(requestedProject);

    const cached = this.repositoryCache.get(overleafProjectId);
    if (cached) {
      const repository = await cached;
      await repository.ensureCloned();
      return repository;
    }

    const repository = new OverleafGitRepository({
      overleafProjectId,
      repositoryDirectory: join(this.configuration.workspaceDirectory, overleafProjectId),
      overleafGitBaseUrl: this.configuration.overleafGitBaseUrl,
      overleafGitToken: this.configuration.overleafGitToken,
      commitAuthorName: this.configuration.gitCommitAuthorName,
      commitAuthorEmail: this.configuration.gitCommitAuthorEmail,
    });

    const opening = repository.ensureCloned().then(() => repository);
    this.repositoryCache.set(overleafProjectId, opening);

    // A failed clone must not poison the cache: drop it so the next call retries.
    opening.catch(() => this.repositoryCache.delete(overleafProjectId));
    return opening;
  }
}
