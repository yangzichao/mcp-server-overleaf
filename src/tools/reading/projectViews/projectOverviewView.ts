import {
  categorizeProjectFiles,
  containsDocumentEnvironment,
  guessMainTexFile,
} from "../../../latex/latexProjectFiles.js";
import { parseLatexSections } from "../../../latex/parseLatexSections.js";
import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../../workflow/synchronizeWithOverleaf.js";

const TEXT_ONLY_CHECKOUT_NOTE =
  "Text-only checkout: figures and other binary files stay off disk until a local compile_project, or manage_files with action upload or restore, brings them back.";

function countByCategory(files: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const file of categorizeProjectFiles(files))
    counts.set(file.category, (counts.get(file.category) ?? 0) + 1);
  return [...counts].map(([category, count]) => `${category} ${count}`).join(", ");
}

async function describeMainDocument(
  repository: OverleafGitRepository,
  mainFile: string | null,
): Promise<string> {
  if (mainFile === null) return "Likely main document: none, the project has no .tex file.";
  const source = await repository.readTextFile(mainFile);
  const sectionCount = parseLatexSections(source).length;
  const sections = `${sectionCount} sectioning command${sectionCount === 1 ? "" : "s"} in that file`;
  const fragmentNote = containsDocumentEnvironment(source)
    ? ""
    : `. It has no \\begin{document}, so it may be an included fragment rather than the root`;
  return `Likely main document: ${mainFile}, with ${sections}${fragmentNote}.`;
}

/** Where a task starts: where the clone is, what the project holds, and what is not pushed yet. */
export async function describeProjectOverview(repository: OverleafGitRepository): Promise<string> {
  await requireSynchronizedWithOverleaf(repository);
  const trackedFiles = await repository.listTrackedFiles();
  const untrackedFiles = await repository.listUntrackedFiles();
  const files = [...new Set([...trackedFiles, ...untrackedFiles])].sort();
  const pendingStatistics = (await repository.getPendingDiffStatistics()).trim();

  const lines = [`Local clone: ${repository.repositoryDirectory}`];
  if (await repository.hasTextOnlyCheckout()) lines.push(TEXT_ONLY_CHECKOUT_NOTE);
  lines.push(
    await describeMainDocument(repository, guessMainTexFile(files)),
    `Files: ${files.length}${files.length > 0 ? ` (${countByCategory(files)})` : ""}, ${trackedFiles.length} of them already in Overleaf.`,
    pendingStatistics === ""
      ? "Local changes not yet pushed: none."
      : `Local changes not yet pushed:\n${pendingStatistics}`,
  );
  if (untrackedFiles.length > 0) lines.push(`New files not yet pushed: ${untrackedFiles.join(", ")}`);
  return lines.join("\n");
}
