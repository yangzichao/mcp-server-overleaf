import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { outlineLatexDocument } from "../../latex/outline/outlineLatexDocument.js";
import { type LatexSection, parseLatexSections } from "../../latex/parseLatexSections.js";
import { describeLocation } from "../../latex/source/scannedSource.js";
import type { OverleafGitRepository } from "../../overleaf/overleafGitRepository.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { createProjectSourceReader } from "../latex/projectSourceReader.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "../toolContext.js";

function describeHeading(section: LatexSection, lineRangePrefix: string): string {
  return `${"  ".repeat(section.depth)}\\${section.level}{${section.title}}  [${lineRangePrefix}lines ${section.startLine}-${section.endLine}]`;
}

function describeSingleFileSections(path: string, source: string): string {
  const sections = parseLatexSections(source);
  if (sections.length === 0) return `No sectioning commands found in ${path}.`;
  return sections.map((section) => describeHeading(section, "")).join("\n");
}

async function describeDocumentOutline(repository: OverleafGitRepository, rootPath: string): Promise<string> {
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

export function registerListSectionsTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_sections",
    {
      title: "List LaTeX sections",
      description:
        "List the sectioning commands in a .tex file, \\part down to \\subparagraph including starred forms, with their nesting depth and line ranges. " +
        "Call it before read_section or edit_section to get the exact titles they match, and to address part of a paper by title instead of line numbers that shift with every edit. " +
        "By default path names a single file and \\input and \\include are not followed. With followIncludes, path is the root document and the outline continues into every file it includes, in reading order, each heading marked with its own file and that file's line numbers. Commented-out headings are skipped either way. " +
        "Pulls from Overleaf first. Returns one line per heading, indented by depth, as \\section{Title} [lines start-end], or says there are none; a missing, binary or out-of-project path fails.",
      inputSchema: z.object({
        project: projectArgument,
        path: z.string().describe("Path to the .tex file relative to the project root, e.g. main.tex."),
        followIncludes: z
          .boolean()
          .default(false)
          .describe(
            "Follow \\input, \\include, \\subfile and \\import from path, giving the outline of the whole document (default false).",
          ),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, path, followIncludes }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);

          return textResult(
            followIncludes
              ? truncateForModel(await describeDocumentOutline(repository, path))
              : describeSingleFileSections(path, await repository.readTextFile(path)),
          );
        }),
      ),
  );
}
