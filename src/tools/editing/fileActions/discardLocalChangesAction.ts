import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";

/** Resets the clone to Overleaf's current version, unpushed commits included. */
export async function discardLocalChangesAction(repository: OverleafGitRepository): Promise<string> {
  const pendingFiles = await repository.getWorkingTreeStatus();
  // Unpushed commits count too. A refused push leaves one behind, and discarding it is the
  // only way that clone can be pushed again without publishing it.
  const { commitsOnlyOnLocal } = await repository.describeRemoteDivergence();
  if (pendingFiles.length === 0 && commitsOnlyOnLocal === 0) return "No local changes to discard.";

  const { discardedCommits } = await repository.discardAllLocalChanges();
  const parts = [`Discarded local changes to ${pendingFiles.length} file(s)`];
  if (discardedCommits > 0) parts.push(`and ${discardedCommits} unpushed commit(s)`);
  return `${parts.join(" ")}. The clone now matches Overleaf.`;
}
