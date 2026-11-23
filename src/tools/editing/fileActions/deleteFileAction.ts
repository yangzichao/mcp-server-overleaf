import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";

/**
 * Removes a file from the clone. stageAllAndCommit runs `git add --all`, which records the
 * deletion when push_changes runs, so nothing here touches the index.
 */
export async function deleteFileAction(repository: OverleafGitRepository, path: string): Promise<string> {
  if (!(await repository.fileExists(path)))
    return `${path} is not in the project, so there is nothing to delete.`;
  await repository.deleteFile(path);
  return (
    `Deleted ${path} from the local clone. It is still in Overleaf. ` +
    "Review it with read_project (view changes), then call push_changes to publish the removal, or manage_files (action discard_local_changes) to keep the file."
  );
}
