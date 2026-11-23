import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { describeDirectoryFiles, EMPTY_DIRECTORY_NOTE } from "./describeDirectoryFiles.js";

const PUBLISH_OR_KEEP =
  "Review the removal with read_project (view changes), then call push_changes to publish it, or manage_files (action discard_local_changes) to keep";

/**
 * Removes a file, or a directory with everything in it, from the clone. stageAllAndCommit runs
 * `git add --all`, which records the deletion when push_changes runs, so nothing here touches the
 * index.
 */
export async function deleteFileAction(repository: OverleafGitRepository, path: string): Promise<string> {
  const directories = repository.directories();
  const kind = await directories.describePathKind(path);
  if (kind === "missing") return `${path} is not in the project, so there is nothing to delete.`;
  if (kind === "file") {
    await repository.deleteFile(path);
    return `Deleted ${path} from the local clone. It is still in Overleaf. ${PUBLISH_OR_KEEP} the file.`;
  }
  const removedFiles = await directories.deleteDirectory(path);
  if (removedFiles.length === 0)
    return `Deleted the empty directory ${path} from the local clone. ${EMPTY_DIRECTORY_NOTE}`;
  return (
    `Deleted the directory ${path} and ${describeDirectoryFiles(removedFiles)} from the local clone. ` +
    `They are still in Overleaf. ${PUBLISH_OR_KEEP} them.`
  );
}
