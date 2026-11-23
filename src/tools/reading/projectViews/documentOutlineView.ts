import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../../workflow/synchronizeWithOverleaf.js";
import { chooseRootDocument } from "../../latex/chooseRootDocument.js";
import { createProjectSourceReader } from "../../latex/projectSourceReader.js";
import { truncateForModel } from "../../toolContext.js";
import { describeOutlineFromSource } from "./describeOutlineFromSource.js";

/** The headings of path, or of the likely main document when no path is given. */
export async function describeDocumentOutline(
  repository: OverleafGitRepository,
  path: string | undefined,
  followIncludes: boolean,
): Promise<string> {
  await requireSynchronizedWithOverleaf(repository);
  const reader = await createProjectSourceReader(repository);
  const root =
    path === undefined
      ? await chooseRootDocument(reader, reader.projectFiles, undefined, "path")
      : { path, warning: undefined };
  const outline = await describeOutlineFromSource(reader, root.path, followIncludes);
  const heading = path === undefined ? `Outline of ${root.path}, the likely main document:\n` : "";
  return truncateForModel(`${heading}${outline}${root.warning ? `\n\n${root.warning}` : ""}`);
}
