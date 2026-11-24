import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../../workflow/synchronizeWithOverleaf.js";
import { formatProjectInventory } from "../formatProjectInventory.js";

export async function describeProjectFiles(
  repository: OverleafGitRepository,
  extension: string | undefined,
  includeUntracked: boolean,
): Promise<string> {
  await requireSynchronizedWithOverleaf(repository);
  const trackedFiles = await repository.listTrackedFiles();
  const untrackedFiles = includeUntracked ? await repository.listUntrackedFiles() : [];
  const suffix = extension ? `.${extension.replace(/^\./, "").toLowerCase()}` : undefined;
  const files = [...new Set([...trackedFiles, ...untrackedFiles])]
    .filter((path) => !suffix || path.toLowerCase().endsWith(suffix))
    .sort();
  return formatProjectInventory(files, trackedFiles, untrackedFiles, suffix);
}
