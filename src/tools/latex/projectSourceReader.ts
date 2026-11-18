import type { ProjectSourceReader } from "../../latex/includes/walkIncludedFiles.js";
import type { OverleafGitRepository } from "../../overleaf/overleafGitRepository.js";

/**
 * The project as the LaTeX checks read it: every committed file plus files created locally,
 * since a figure added with upload_file counts as present before it is pushed.
 */
export async function createProjectSourceReader(
  repository: OverleafGitRepository,
): Promise<ProjectSourceReader> {
  const projectFiles = new Set([
    ...(await repository.listTrackedFiles()),
    ...(await repository.listUntrackedFiles()),
  ]);
  return { projectFiles, readTextFile: (path) => repository.readTextFile(path) };
}
