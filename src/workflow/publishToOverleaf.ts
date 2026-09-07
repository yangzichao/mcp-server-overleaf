import type { OverleafGitRepository } from "../overleaf/overleafGitRepository.js";

export type PublishOutcome =
  | { readonly status: "pushed"; readonly commitHash: string; readonly diff: string; readonly report: string }
  | { readonly status: "nothing-to-push" }
  | {
      readonly status: "conflict-with-collaborator";
      readonly commitHash: string;
      readonly conflictReport: string;
    }
  | { readonly status: "push-rejected"; readonly commitHash: string; readonly report: string };

/**
 * The second half of the safety contract: commit, then re-check Overleaf immediately
 * before pushing. If a collaborator pushed while the model was editing, the local work
 * is rebased on top of theirs; if that cannot be done cleanly the push is refused and
 * the conflict is reported rather than resolved by guessing.
 *
 * Overleaf refuses force pushes and keeps one linear history per project, so a rejected
 * push is always resolved by rebasing, never by rewriting the remote.
 */
export async function publishToOverleaf(
  repository: OverleafGitRepository,
  commitMessage: string,
): Promise<PublishOutcome> {
  const { committed, commitHash } = await repository.stageAllAndCommit(commitMessage);

  if (!committed) {
    const divergence = await repository.describeRemoteDivergence();
    if (divergence.commitsOnlyOnLocal === 0) {
      return { status: "nothing-to-push" };
    }
  }

  await repository.fetchRemote();
  const divergence = await repository.describeRemoteDivergence();

  if (divergence.commitsOnlyOnRemote > 0) {
    const rebase = await repository.rebaseOntoRemote();
    if (!rebase.succeeded) {
      return {
        status: "conflict-with-collaborator",
        commitHash,
        conflictReport: rebase.conflictReport,
      };
    }
  }

  const remoteBeforePush = await repository.getRemoteCommitHash();
  const push = await repository.pushToOverleaf();
  const headAfterPush = await repository.getHeadCommitHash();

  if (!push.succeeded) {
    return { status: "push-rejected", commitHash: headAfterPush, report: push.report };
  }

  return {
    status: "pushed",
    commitHash: headAfterPush,
    diff: await repository.getDiffBetweenCommits(remoteBeforePush, headAfterPush),
    report: push.report,
  };
}
