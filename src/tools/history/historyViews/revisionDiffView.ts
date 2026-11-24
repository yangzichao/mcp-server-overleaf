import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { truncateForModel } from "../../toolContext.js";

/**
 * What changed between two recorded revisions. It does not pull, so a missing toRevision means
 * Overleaf's version as last fetched.
 */
export async function describeRevisionDiff(
  repository: OverleafGitRepository,
  fromRevision: string,
  toRevision: string | undefined,
  path: string | undefined,
): Promise<string> {
  const diff = await repository.history().diff(fromRevision, toRevision, path);
  const range = `${fromRevision}..${toRevision ?? "Overleaf's latest version"}`;
  return diff.trim() === ""
    ? `No differences in ${path ?? "the project"} for ${range}.`
    : truncateForModel(diff);
}
