import type { OverleafGitRepository } from "../overleaf/overleafGitRepository.js";

export interface SynchronizationResult {
  readonly branchName: string;
  readonly pulledCommits: number;
  /** Commits sitting on Overleaf that could not be merged in, non-zero only after a failed rebase. */
  readonly commitsStillOnlyOnRemote: number;
  readonly localCommitsNotYetPushed: number;
  readonly uncommittedFiles: string[];
  readonly rebaseConflict: string | null;
  readonly headCommitHash: string;
}

/**
 * Brings the clone up to date with Overleaf before anything is read or edited.
 *
 * This is the first half of the safety contract: a model should never reason about,
 * or write on top of, a stale copy of a file a collaborator has already changed.
 */
export async function synchronizeWithOverleaf(
  repository: OverleafGitRepository,
): Promise<SynchronizationResult> {
  await repository.ensureCloned();
  await repository.fetchRemote();

  const divergenceBefore = await repository.describeRemoteDivergence();
  let rebaseConflict: string | null = null;

  if (divergenceBefore.commitsOnlyOnRemote > 0) {
    const rebase = await repository.rebaseOntoRemote();
    if (!rebase.succeeded) {
      rebaseConflict = rebase.conflictReport;
    }
  }

  const divergenceAfter = await repository.describeRemoteDivergence();

  return {
    branchName: divergenceAfter.branchName,
    pulledCommits: divergenceBefore.commitsOnlyOnRemote - divergenceAfter.commitsOnlyOnRemote,
    commitsStillOnlyOnRemote: divergenceAfter.commitsOnlyOnRemote,
    localCommitsNotYetPushed: divergenceAfter.commitsOnlyOnLocal,
    uncommittedFiles: await repository.getWorkingTreeStatus(),
    rebaseConflict,
    headCommitHash: await repository.getHeadCommitHash(),
  };
}

/** Reads and edits must not silently proceed after a failed synchronization. */
export async function requireSynchronizedWithOverleaf(repository: OverleafGitRepository): Promise<void> {
  const result = await synchronizeWithOverleaf(repository);
  if (result.rebaseConflict || result.commitsStillOnlyOnRemote > 0) {
    throw new Error(
      "Cannot synchronize with Overleaf. Local work has been preserved. " +
        "Review it with show_diff, then publish with push_changes or explicitly discard it with discard_local_changes.\n" +
        (result.rebaseConflict ?? "Remote commits could not be integrated."),
    );
  }
}
