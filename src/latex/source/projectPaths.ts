/**
 * Path arithmetic for paths written inside LaTeX source. Overleaf runs TeX in the project
 * root, so these are project paths with forward slashes, never paths on this machine.
 */

export function directoryOf(projectPath: string): string {
  const lastSlash = projectPath.lastIndexOf("/");
  return lastSlash === -1 ? "" : projectPath.slice(0, lastSlash);
}

function joinedSegments(directory: string, writtenPath: string): string[] | null {
  if (writtenPath.startsWith("/") || /^[A-Za-z]:/.test(writtenPath)) return null;
  const segments: string[] = [];
  for (const segment of `${directory}/${writtenPath}`.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments;
}

/**
 * Joins a directory and a path written in the source, collapsing `.` and `..`. Null when
 * the result is not inside the project: an absolute path, or one that climbs above the root.
 */
export function joinProjectPath(directory: string, writtenPath: string): string | null {
  const segments = joinedSegments(directory, writtenPath);
  return segments === null || segments.length === 0 ? null : segments.join("/");
}

export function joinProjectDirectory(directory: string, writtenPath: string): string | null {
  return joinedSegments(directory, writtenPath)?.join("/") ?? null;
}

/** Tries each directory and file name in order, returning the first that exists, or every candidate. */
export function findFirstExistingPath(
  directories: readonly string[],
  fileNames: readonly string[],
  projectFiles: ReadonlySet<string>,
): { found: string } | { tried: string[] } {
  const tried: string[] = [];
  for (const directory of new Set(directories)) {
    for (const fileName of fileNames) {
      const candidate = joinProjectPath(directory, fileName);
      if (candidate === null || tried.includes(candidate)) continue;
      if (projectFiles.has(candidate)) return { found: candidate };
      tried.push(candidate);
    }
  }
  return { tried };
}
