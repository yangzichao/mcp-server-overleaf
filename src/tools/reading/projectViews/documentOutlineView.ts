import { outlineLatexDocument } from "../../../latex/outline/outlineLatexDocument.js";
import { type LatexSection, parseLatexSections } from "../../../latex/parseLatexSections.js";
import { describeLocation } from "../../../latex/source/scannedSource.js";
import type { OverleafGitRepository } from "../../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../../workflow/synchronizeWithOverleaf.js";
import { chooseRootDocument } from "../../latex/chooseRootDocument.js";
import { createProjectSourceReader } from "../../latex/projectSourceReader.js";
import { truncateForModel } from "../../toolContext.js";

function describeHeading(section: LatexSection, lineRangePrefix: string): string {
  return `${"  ".repeat(section.depth)}\\${section.level}{${section.title}}  [${lineRangePrefix}lines ${section.startLine}-${section.endLine}]`;
}

function describeSingleFileSections(path: string, source: string): string {
  const sections = parseLatexSections(source);
  if (sections.length === 0) return `No sectioning commands found in ${path}.`;
  return sections.map((section) => describeHeading(section, "")).join("\n");
}

async function describeIncludedOutline(repository: OverleafGitRepository, rootPath: string): Promise<string> {
  const outline = await outlineLatexDocument(await createProjectSourceReader(repository), rootPath);
  const included = outline.checkedFiles.length - 1;
  const scope = included > 0 ? `${rootPath} and the ${included} files it includes` : rootPath;
  const lines =
    outline.headings.length === 0
      ? [`No sectioning commands found in ${scope}.`]
      : outline.headings.map((heading) => describeHeading(heading.section, `${heading.path} `));
  for (const missing of outline.missingIncludes) {
    lines.push(`Not found: ${missing.written} at ${describeLocation(missing.location)}`);
  }
  return lines.join("\n");
}

/** The headings of path, or of the likely main document when no path is given. */
export async function describeDocumentOutline(
  repository: OverleafGitRepository,
  path: string | undefined,
  followIncludes: boolean,
): Promise<string> {
  await requireSynchronizedWithOverleaf(repository);
  const root =
    path === undefined
      ? await chooseRootDocument(
          repository,
          (await createProjectSourceReader(repository)).projectFiles,
          undefined,
          "path",
        )
      : { path, warning: undefined };
  const outline = followIncludes
    ? await describeIncludedOutline(repository, root.path)
    : describeSingleFileSections(root.path, await repository.readTextFile(root.path));
  const heading = path === undefined ? `Outline of ${root.path}, the likely main document:\n` : "";
  return truncateForModel(`${heading}${outline}${root.warning ? `\n\n${root.warning}` : ""}`);
}
