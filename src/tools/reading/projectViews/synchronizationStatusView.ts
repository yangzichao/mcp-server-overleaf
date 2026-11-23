import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { synchronizeWithOverleaf } from "../../../workflow/synchronizeWithOverleaf.js";

/**
 * The clone's commits against Overleaf. It pulls as part of answering, and a pull that cannot
 * finish is reported rather than thrown: this view is how a model finds out about the conflict.
 */
export async function describeSynchronizationStatus(repository: OverleafGitRepository): Promise<string> {
  const synchronization = await synchronizeWithOverleaf(repository);
  const recentLog = await repository.getRecentCommitLog(10);

  const lines = [
    `branch: ${synchronization.branchName}`,
    `head: ${synchronization.headCommitHash.slice(0, 10)}`,
    `commits pulled from Overleaf just now: ${synchronization.pulledCommits}`,
    `commits on Overleaf not yet merged in: ${synchronization.commitsStillOnlyOnRemote}`,
    `local commits not yet pushed: ${synchronization.localCommitsNotYetPushed}`,
    `files edited locally and not yet committed: ${synchronization.uncommittedFiles.length}`,
  ];
  if (synchronization.uncommittedFiles.length > 0) {
    lines.push(...synchronization.uncommittedFiles.map((entry) => `  ${entry}`));
  }
  if (synchronization.rebaseConflict) {
    lines.push(
      "",
      "WARNING: synchronization could not finish. Local work was preserved; the clone is not up to date.",
      synchronization.rebaseConflict,
    );
  }
  lines.push("", "recent history:", recentLog);
  return lines.join("\n");
}
