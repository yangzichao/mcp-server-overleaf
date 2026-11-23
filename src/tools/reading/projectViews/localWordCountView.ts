import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../../workflow/synchronizeWithOverleaf.js";
import { countLatexWords } from "../../../workflow/wordCount/countLatexWords.js";
import type { TexcountCounts } from "../../../workflow/wordCount/parseTexcountReport.js";
import { chooseRootDocument } from "../../latex/chooseRootDocument.js";
import { createProjectSourceReader } from "../../latex/projectSourceReader.js";
import { truncateForModel } from "../../toolContext.js";
import { describeWordCountTotals, type WordCountTotals } from "./describeWordCountTotals.js";

/**
 * word_count on a server that edits a Git clone: texcount run in the clone with the flags of
 * Overleaf's Word Count menu, so edits not yet pushed are counted and the numbers match that
 * menu once they are. A text-only checkout still holds every .tex file texcount reads.
 */

const TEX_SOURCE = /\.(tex|ltx)$/i;

function asTotals(counts: TexcountCounts): WordCountTotals {
  return {
    textWords: counts.wordsInText,
    headingWords: counts.wordsInHeaders,
    wordsOutsideText: counts.wordsOutsideText,
    headingCount: counts.headers,
    floatCount: counts.floats,
    inlineMathCount: counts.inlineMath,
    displayMathCount: counts.displayedMath,
  };
}

export async function describeLocalWordCount(
  repository: OverleafGitRepository,
  path: string | undefined,
): Promise<string> {
  await requireSynchronizedWithOverleaf(repository);
  const reader = await createProjectSourceReader(repository);
  const root = await chooseRootDocument(reader, reader.projectFiles, path, "path");
  if (!TEX_SOURCE.test(root.path)) {
    throw new Error(`word_count counts a .tex file, and ${root.path} is not one.`);
  }
  const count = await countLatexWords({
    projectDirectory: repository.repositoryDirectory,
    mainTexFile: root.path,
  });

  const subject = path === undefined ? `${count.mainTexFile}, the likely main document` : count.mainTexFile;
  const lines = [
    `texcount's word count for ${subject}, in the local clone with edits not yet pushed:`,
    ...describeWordCountTotals(asTotals(count.totals)),
  ];
  if (count.files.length > 1) {
    lines.push(
      "Words in text by file:",
      ...count.files.map((file) => `- ${file.path}: ${file.counts.wordsInText}`),
    );
  }
  if (count.problems.length > 0) {
    lines.push("texcount's messages:", ...count.problems.map((problem) => `- ${problem}`));
  }
  if (root.warning) lines.push(root.warning);
  return truncateForModel(lines.join("\n"));
}
