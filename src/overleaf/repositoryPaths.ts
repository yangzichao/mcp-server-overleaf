import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

export class UnsafeRepositoryPathError extends Error {}

/**
 * True when a path that `relative()` returned leaves its base directory: ".." or "../…",
 * or another drive on Windows. A name that only starts with two dots, such as "..notes.tex",
 * stays inside.
 */
export function leavesBaseDirectory(pathFromBase: string): boolean {
  return pathFromBase === ".." || pathFromBase.startsWith(`..${sep}`) || isAbsolute(pathFromBase);
}

/**
 * Resolves a client-supplied relative path inside the clone, refusing anything that
 * escapes it. Tool arguments come from a language model, so `../../.ssh/id_rsa` and
 * absolute paths have to be rejected rather than trusted.
 */
export function resolvePathInsideRepository(repositoryDirectory: string, relativePath: string): string {
  const trimmedPath = relativePath.trim();
  if (trimmedPath === "") {
    throw new UnsafeRepositoryPathError("File path must not be empty.");
  }
  if (isAbsolute(trimmedPath)) {
    throw new UnsafeRepositoryPathError(
      `File path must be relative to the project root, received "${relativePath}".`,
    );
  }

  const normalizedRelativePath = normalize(trimmedPath);
  const absolutePath = resolve(repositoryDirectory, normalizedRelativePath);
  const pathRelativeToRepository = relative(repositoryDirectory, absolutePath);

  if (pathRelativeToRepository === "" || leavesBaseDirectory(pathRelativeToRepository)) {
    throw new UnsafeRepositoryPathError(`File path "${relativePath}" resolves outside the project.`);
  }
  // macOS and Windows filesystems are case-insensitive, so ".GIT/config" reaches the same
  // directory as ".git/config". Compare case-insensitively or the guard is bypassable.
  if (pathRelativeToRepository.split(sep)[0]?.toLowerCase() === ".git") {
    throw new UnsafeRepositoryPathError("Refusing to touch the .git directory.");
  }

  return absolutePath;
}
