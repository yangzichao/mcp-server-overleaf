import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { extractSectionText, findSectionByTitle, parseLatexSections } from "../latex/parseLatexSections.js";
import { formatSearchMatches, searchProjectFiles } from "../latex/searchProjectFiles.js";
import { requireSynchronizedWithOverleaf } from "../workflow/synchronizeWithOverleaf.js";
import { registerCheckReferencesTool } from "./latex/checkReferencesTool.js";
import { registerVerifyCitationsTool } from "./latex/verifyCitationsTool.js";
import { projectArgument } from "./projectArgument.js";
import { registerListSectionsTool } from "./reading/listSectionsTool.js";
import { registerProjectInventoryTools } from "./reading/projectInventoryTools.js";
import { registerReadFileTool } from "./reading/readFileTool.js";
import { READS_OVERLEAF } from "./toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "./toolContext.js";

export function registerReadTools(server: McpServer, context: ToolContext): void {
  registerReadFileTool(server, context);
  registerProjectInventoryTools(server, context);
  registerCheckReferencesTool(server, context);
  registerVerifyCitationsTool(server, context);

  registerListSectionsTool(server, context);

  server.registerTool(
    "read_section",
    {
      title: "Read one LaTeX section",
      description:
        "Read one section of a .tex file by its title: from its heading to the next heading at the same or a shallower level, stopping before trailing matter such as \\appendix, the bibliography or \\end{document}. " +
        "Prefer it over read_file when revising one part of a paper, so the rest stays out of context. " +
        "sectionTitle is compared case-insensitively with the title in braces, not an optional [short] title: an exact match wins, otherwise the first heading in document order that contains it, so a short fragment can pick an earlier section than intended. " +
        "Pulls from Overleaf first. Returns the section's LaTeX source as stored, cut off after 60,000 characters; if nothing matches, the reply lists the titles that exist.",
      inputSchema: z.object({
        project: projectArgument,
        path: z.string().describe("Path to the .tex file relative to the project root, e.g. main.tex."),
        sectionTitle: z
          .string()
          .describe(
            "Section title exactly as it appears inside the sectioning command, e.g. Introduction for \\section{Introduction}. Call list_sections first if unsure.",
          ),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, path, sectionTitle }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);

          const fileContent = await repository.readTextFile(path);
          const sections = parseLatexSections(fileContent);
          const section = findSectionByTitle(sections, sectionTitle);
          if (!section) {
            return textResult(
              `No section matching "${sectionTitle}" in ${path}. Available: ${sections.map((entry) => entry.title).join(", ")}`,
            );
          }
          return textResult(truncateForModel(extractSectionText(fileContent, section)));
        }),
      ),
  );

  server.registerTool(
    "search_project",
    {
      title: "Search the project",
      description:
        "Search the project's text sources for a literal string or a regular expression, returning matching lines as path:line: text. " +
        "Use it to find where a term, citation key, label or command appears when you do not know which file holds it; once you do, use read_file or read_section, and use list_files to find a file by name. " +
        "Only .tex, .ltx, .bib, .cls, .sty, .bst, .txt and .md files are searched, and a file created locally is not searched until push_changes commits it. " +
        "Both modes are case-insensitive and match one line at a time, so a pattern cannot span lines. " +
        "A regular expression uses JavaScript syntax, sees the first 4,000 characters of each line, and is abandoned with an error after 10 seconds; an invalid one fails with its syntax error. " +
        "maximumMatches counts matching lines, taken in path order. Pulls from Overleaf first.",
      inputSchema: z.object({
        project: projectArgument,
        query: z
          .string()
          .describe(
            "What to look for. Literal text by default, so LaTeX backslashes need no escaping; a regular expression when isRegularExpression is true.",
          ),
        isRegularExpression: z
          .boolean()
          .optional()
          .describe("Treat query as a regular expression instead of literal text (default false)."),
        maximumMatches: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Stop after this many matches, between 1 and 500 (default 100)."),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, query, isRegularExpression, maximumMatches }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);

          const matches = await searchProjectFiles({
            trackedFiles: await repository.listTrackedFiles(),
            readTextFile: (path) => repository.readTextFile(path),
            query,
            isRegularExpression: isRegularExpression ?? false,
            maximumMatches: maximumMatches ?? 100,
          });

          return textResult(
            matches.length === 0
              ? `No matches for "${query}".`
              : truncateForModel(formatSearchMatches(matches)),
          );
        }),
      ),
  );
}
