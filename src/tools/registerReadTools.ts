import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { extractSectionText, findSectionByTitle, parseLatexSections } from "../latex/parseLatexSections.js";
import { formatSearchMatches, searchProjectFiles } from "../latex/searchProjectFiles.js";
import { requireSynchronizedWithOverleaf } from "../workflow/synchronizeWithOverleaf.js";
import { ANY_OTHER_PROJECT, projectArgument } from "./projectArgument.js";
import { registerProjectInventoryTools } from "./reading/projectInventoryTools.js";
import { registerReadFileTool } from "./reading/readFileTool.js";
import { READS_LOCAL_CONFIGURATION, READS_OVERLEAF } from "./toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "./toolContext.js";

export function registerReadTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_projects",
    {
      title: "List Overleaf projects",
      description:
        "List the Overleaf projects this server is configured to reach, marking which one is the default. " +
        "Reads local configuration only, so it answers without contacting Overleaf and proves nothing about access. " +
        "Call this when a request is ambiguous about which paper it means, or when another tool reports an unknown project. " +
        "Any project not listed can still be reached by passing its Overleaf address as `project`.",
      inputSchema: z.object({}),
      annotations: READS_LOCAL_CONFIGURATION,
    },
    () =>
      runToolSafely(context, () => {
        const names = context.projectRegistry.listRegisteredProjectNames();
        if (names.length === 0) {
          return textResult(`No projects are registered.\n${ANY_OTHER_PROJECT}`);
        }
        const defaultName = context.configuration.defaultProjectName;
        return textResult(
          `${names
            .map((name) => {
              const displayName = context.configuration.registeredProjects.find(
                (project) => project.projectName === name,
              )?.displayName;
              return `- ${name}${name === defaultName ? "  (default)" : ""}${displayName ? ` — ${displayName}` : ""}`;
            })
            .join("\n")}\n\n${ANY_OTHER_PROJECT}`,
        );
      }),
  );

  registerReadFileTool(server, context);
  registerProjectInventoryTools(server, context);

  server.registerTool(
    "list_sections",
    {
      title: "List LaTeX sections",
      description:
        "List the sectioning commands in a .tex file — \\section, \\subsection and the rest — with their nesting depth and line ranges. " +
        "Pulls from Overleaf first. Call this before read_section or edit_section to learn the exact titles those tools expect, " +
        "and to address a part of a paper by title rather than by line number, which shifts as the file is edited.",
      inputSchema: z.object({
        project: projectArgument,
        path: z.string().describe("Path to the .tex file relative to the project root, e.g. main.tex."),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, path }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);

          const sections = parseLatexSections(await repository.readTextFile(path));
          if (sections.length === 0) {
            return textResult(`No sectioning commands found in ${path}.`);
          }
          return textResult(
            sections
              .map(
                (section) =>
                  `${"  ".repeat(section.depth)}\\${section.level}{${section.title}}  [lines ${section.startLine}-${section.endLine}]`,
              )
              .join("\n"),
          );
        }),
      ),
  );

  server.registerTool(
    "read_section",
    {
      title: "Read one LaTeX section",
      description:
        "Read one section of a .tex file, located by its title rather than by line number. " +
        "The section runs from its own sectioning command to whichever comes first: the next heading at the same or a shallower level, " +
        "or trailing matter such as \\end{document}, \\appendix or the bibliography, which belongs to no section. " +
        "Pulls from Overleaf first. Prefer this over read_file when revising one part of a paper, so the rest of the document stays out of context. " +
        "Title matching is case-insensitive and falls back to a substring match; if nothing matches, the reply lists the titles that do exist.",
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
        "Search the project's LaTeX and text sources for a string or regular expression, returning matching lines as path:line:text. " +
        "Pulls from Overleaf first. Use this to find where a term, citation key, label or command is used across a multi-file paper, " +
        "when you do not already know which file holds it. " +
        "Only .tex, .ltx, .bib, .cls, .sty, .bst, .txt and .md files are searched; figures, PDFs and other data files are not. " +
        "Literal searches are case-insensitive.",
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
