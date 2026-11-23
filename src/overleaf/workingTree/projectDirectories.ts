import { lstat, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

import type { GitCommandResult } from "../gitCommandRunner.js";
import { resolvePathInsideRepository } from "../repositoryPaths.js";
import { moveIndexEntries } from "./diskSpelling/moveIndexEntries.js";
import { pathAsStoredOnDisk } from "./diskSpelling/pathAsStoredOnDisk.js";
import { isAtOrInsideDirectory } from "./isAtOrInsideDirectory.js";
import { isNothingAtPathError } from "./isNothingAtPathError.js";
import { requireFileShapedPath } from "./requireFileShapedPath.js";

/**
 * Deleting and moving whole directories of the clone, for manage_files. OverleafGitRepository
 * hands over its path guards, so a directory is contained exactly as a single file is.
 *
 * Sparse checkout is the hazard. In a text-only checkout a figure under the directory is in
 * Git's index but not on disk, and `git add --all` never stages the removal of such a file, so
 * deleting or moving only what is on disk would leave it behind in Overleaf. A directory that
 * holds such a file brings the full checkout back first, as an upload does.
 */

export type ProjectPathKind = "file" | "directory" | "missing";

export type RespellOutcome = "the source itself" | "elsewhere" | { readonly respelledFiles: string[] };

export type ExistingPathRelation = "two names of one entry" | "two entries";

export interface ProjectDirectoryAccess {
  readonly repositoryDirectory: string;
  readonly git: (args: readonly string[]) => Promise<GitCommandResult>;
  readonly resolveClientPath: (relativePath: string) => Promise<string>;
  /** Brings back a tracked path that sparse checkout left off disk. */
  readonly materializePathIfNeeded: (relativePath: string) => Promise<void>;
  readonly materializeAllFiles: () => Promise<void>;
}

async function existsOnDisk(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function isOneEntry(firstAbsolutePath: string, secondAbsolutePath: string): Promise<boolean> {
  try {
    const [first, second] = await Promise.all([
      lstat(firstAbsolutePath, { bigint: true }),
      lstat(secondAbsolutePath, { bigint: true }),
    ]);
    return first.dev === second.dev && first.ino === second.ino;
  } catch (error) {
    if (isNothingAtPathError(error)) return false;
    throw error;
  }
}

export class ProjectDirectories {
  constructor(private readonly access: ProjectDirectoryAccess) {}

  /**
   * What a path names in the working tree. A path outside the clone throws rather than reading
   * as missing.
   */
  async describePathKind(relativePath: string): Promise<ProjectPathKind> {
    await this.access.materializePathIfNeeded(relativePath);
    const absolutePath = await this.access.resolveClientPath(relativePath);
    try {
      const entry = await stat(absolutePath);
      if (entry.isDirectory()) return "directory";
      return entry.isFile() ? "file" : "missing";
    } catch (error) {
      if (isNothingAtPathError(error)) return "missing";
      throw error;
    }
  }

  async compareExistingPaths(
    firstRelativePath: string,
    secondRelativePath: string,
  ): Promise<ExistingPathRelation> {
    const firstAbsolutePath = await this.access.resolveClientPath(firstRelativePath);
    const secondAbsolutePath = await this.access.resolveClientPath(secondRelativePath);
    return (await this.areOneEntryUnderTwoSpellings(firstAbsolutePath, secondAbsolutePath))
      ? "two names of one entry"
      : "two entries";
  }

  /**
   * rename(2) changes the name the disk stores; Git's index entries follow it, since Git on such
   * a disk cannot see the change itself.
   */
  async respellIfOneEntryUnderTwoSpellings(
    fromRelativePath: string,
    toRelativePath: string,
  ): Promise<RespellOutcome> {
    const fromAbsolutePath = await this.access.resolveClientPath(fromRelativePath);
    const toAbsolutePath = resolvePathInsideRepository(this.access.repositoryDirectory, toRelativePath);
    if (fromAbsolutePath === toAbsolutePath) return "the source itself";
    if (dirname(fromAbsolutePath) !== dirname(toAbsolutePath)) return "elsewhere";
    if (!(await this.areOneEntryUnderTwoSpellings(fromAbsolutePath, toAbsolutePath))) return "elsewhere";
    const sameNameOnceNormalized =
      basename(fromAbsolutePath).normalize("NFC") === basename(toAbsolutePath).normalize("NFC");
    if (sameNameOnceNormalized) return "the source itself";

    await this.bringBackHiddenFilesUnder(fromAbsolutePath);
    const files = await this.listFilesUnder(fromAbsolutePath);
    await rename(fromAbsolutePath, toAbsolutePath);
    const fromGitPath = this.toGitPath(fromAbsolutePath);
    const toGitPath = this.toGitPath(toAbsolutePath);
    await moveIndexEntries(this.access.git, fromGitPath, toGitPath);
    return { respelledFiles: files.map((file) => `${toGitPath}${file.slice(fromGitPath.length)}`) };
  }

  /** Removes the directory and everything in it; answers with the project files that were in it. */
  async deleteDirectory(relativePath: string): Promise<string[]> {
    const absolutePath = await this.requireDirectory(relativePath);
    await this.bringBackHiddenFilesUnder(absolutePath);
    const files = await this.listFilesUnder(absolutePath);
    await rm(absolutePath, { recursive: true });
    return files;
  }

  /** Moves the directory to a path that must not exist yet; answers with the files at their new paths. */
  async moveDirectory(fromRelativePath: string, toRelativePath: string): Promise<string[]> {
    const fromAbsolutePath = await this.requireDirectory(fromRelativePath);
    // resolveClientPath contains a path that does not exist yet by checking its nearest
    // existing ancestor, so a symlinked directory cannot carry the files out of the clone.
    const toAbsolutePath = await this.access.resolveClientPath(toRelativePath);
    if (await isAtOrInsideDirectory(toAbsolutePath, fromAbsolutePath)) {
      throw new Error(
        `${toRelativePath} is inside ${fromRelativePath}, and a directory cannot be moved into itself. Nothing was moved.`,
      );
    }
    if ((await this.describePathKind(toRelativePath)) !== "missing") {
      throw new Error(`${toRelativePath} already exists. Nothing was moved.`);
    }
    await requireFileShapedPath(this.access.repositoryDirectory, toRelativePath, toAbsolutePath);
    await this.bringBackHiddenFilesUnder(fromAbsolutePath);
    const files = await this.listFilesUnder(fromAbsolutePath);
    await mkdir(dirname(toAbsolutePath), { recursive: true });
    await rename(fromAbsolutePath, toAbsolutePath);
    const fromGitPath = this.toGitPath(fromAbsolutePath);
    const toGitPath = this.toGitPath(toAbsolutePath);
    return files.map((file) => `${toGitPath}${file.slice(fromGitPath.length)}`);
  }

  private async areOneEntryUnderTwoSpellings(
    firstAbsolutePath: string,
    secondAbsolutePath: string,
  ): Promise<boolean> {
    if (!(await isOneEntry(firstAbsolutePath, secondAbsolutePath))) return false;
    const [firstAsStored, secondAsStored] = await Promise.all([
      pathAsStoredOnDisk(this.access.repositoryDirectory, this.toGitPath(firstAbsolutePath)),
      pathAsStoredOnDisk(this.access.repositoryDirectory, this.toGitPath(secondAbsolutePath)),
    ]);
    return firstAsStored !== undefined && firstAsStored.normalize("NFC") === secondAsStored?.normalize("NFC");
  }

  private async requireDirectory(relativePath: string): Promise<string> {
    await this.access.materializePathIfNeeded(relativePath);
    const absolutePath = await this.access.resolveClientPath(relativePath);
    if (!(await stat(absolutePath)).isDirectory()) throw new Error(`${relativePath} is not a directory.`);
    return absolutePath;
  }

  /** `ls-files -t` tags a file that sparse checkout keeps off disk with "S". */
  private async bringBackHiddenFilesUnder(absolutePath: string): Promise<void> {
    const { stdout } = await this.access.git([
      "ls-files",
      "-t",
      "-z",
      "--",
      `:(literal)${this.toGitPath(absolutePath)}`,
    ]);
    if (stdout.split("\0").some((entry) => entry.startsWith("S "))) await this.access.materializeAllFiles();
  }

  /** Committed and new files under the directory, leaving out ignored ones and files already deleted. */
  private async listFilesUnder(absolutePath: string): Promise<string[]> {
    const { stdout } = await this.access.git([
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      `:(literal)${this.toGitPath(absolutePath)}`,
    ]);
    const listed = [...new Set(stdout.split("\0").filter(Boolean))];
    const present: string[] = [];
    for (const path of listed) {
      if (await existsOnDisk(join(this.access.repositoryDirectory, path))) present.push(path);
    }
    return present.sort();
  }

  private toGitPath(absolutePath: string): string {
    return relative(this.access.repositoryDirectory, absolutePath).split(sep).join("/");
  }
}
