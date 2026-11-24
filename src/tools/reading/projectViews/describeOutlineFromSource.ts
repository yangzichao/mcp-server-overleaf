import type { ProjectSourceReader } from "../../../latex/includes/walkIncludedFiles.js";
import { outlineLatexDocument } from "../../../latex/outline/outlineLatexDocument.js";
import { type LatexSection, parseLatexSections } from "../../../latex/parseLatexSections.js";
import { describeLocation } from "../../../latex/source/scannedSource.js";

/**
 * The outline lines both read_project versions print, from whichever source holds the project:
 * the local clone, or Overleaf's editor when there is no clone.
 */

function describeHeading(section: LatexSection, lineRangePrefix: string): string {
  return `${"  ".repeat(section.depth)}\\${section.level}{${section.title}}  [${lineRangePrefix}lines ${section.startLine}-${section.endLine}]`;
}

function describeSingleFileSections(path: string, source: string): string {
  const sections = parseLatexSections(source);
  if (sections.length === 0) return `No sectioning commands found in ${path}.`;
  return sections.map((section) => describeHeading(section, "")).join("\n");
}

async function describeIncludedOutline(reader: ProjectSourceReader, rootPath: string): Promise<string> {
  const outline = await outlineLatexDocument(reader, rootPath);
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

/** The headings of rootPath, alone or across every file it includes, one line each. */
export async function describeOutlineFromSource(
  reader: ProjectSourceReader,
  rootPath: string,
  followIncludes: boolean,
): Promise<string> {
  return followIncludes
    ? describeIncludedOutline(reader, rootPath)
    : describeSingleFileSections(rootPath, await reader.readTextFile(rootPath));
}
