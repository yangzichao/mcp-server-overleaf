import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../../workflow/synchronizeWithOverleaf.js";
import { truncateForModel } from "../../toolContext.js";
import { describeCommitHistory } from "../describeCommitHistory.js";
import { toGitHistoryBoundary } from "../historyDateArgument.js";

export const DEFAULT_COMMIT_LIMIT = 20;

export interface CommitHistoryFilter {
  readonly path: string | undefined;
  readonly since: string | undefined;
  readonly until: string | undefined;
  readonly limit: number;
}

/** The log, newest first, after pulling so a collaborator's latest commit is in it. */
export async function describeCommitHistoryView(
  repository: OverleafGitRepository,
  filter: CommitHistoryFilter,
): Promise<string> {
  await requireSynchronizedWithOverleaf(repository);
  const commits = await repository.history().listCommits({
    path: filter.path,
    since: filter.since && toGitHistoryBoundary(filter.since, "since"),
    until: filter.until && toGitHistoryBoundary(filter.until, "until"),
    limit: filter.limit,
  });
  return truncateForModel(describeCommitHistory(commits, filter.path ?? "the project", filter.limit));
}
