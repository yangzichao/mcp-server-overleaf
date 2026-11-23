import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { truncateForModel } from "../../toolContext.js";

/** What push_changes would publish. It does not pull, so it compares against Overleaf as last fetched. */
export async function describePendingChanges(
  repository: OverleafGitRepository,
  path: string | undefined,
): Promise<string> {
  const diff = await repository.getPendingDiff(path);
  return diff.trim() === "" ? "No local changes pending." : truncateForModel(diff);
}
