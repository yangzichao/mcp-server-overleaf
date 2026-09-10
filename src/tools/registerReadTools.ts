import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { extractSectionText, findSectionByTitle, parseLatexSections } from "../latex/parseLatexSections.js";
import { formatSearchMatches, searchProjectFiles } from "../latex/searchProjectFiles.js";
import { requireSynchronizedWithOverleaf } from "../workflow/synchronizeWithOverleaf.js";
import { ANY_OTHER_PROJECT, projectArgument } from "./projectArgument.js";
import { registerProjectInventoryTools } from "./reading/projectInventoryTools.js";
import { registerReadFileTool } from "./reading/readFileTool.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "./toolContext.js";

export function registerReadTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_projects",
    {
      title: "List Overleaf projects",
      description:
        "List the Overleaf projects this server is configured to reach, and which one is the default.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
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
        "List the sectioning commands in a .tex file with their line ranges, so a section can be addressed by title instead of by line number.",
      inputSchema: z.object({
        project: projectArgument,
        path: z.string().describe("Path to the .tex file relative to the project root."),
      }),
      annotations: { readOnlyHint: true },
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
      description: "Read the body of a single section of a .tex file, located by its title.",
      inputSchema: z.object({
        project: projectArgument,
        path: z.string().describe("Path to the .tex file relative to the project root."),
        sectionTitle: z
          .string()
          .describe("Section title as it appears in the sectioning command, e.g. Introduction."),
      }),
      annotations: { readOnlyHint: true },
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
        "Search all tracked text files for a string or regular expression, returning matching lines.",
      inputSchema: z.object({
        project: projectArgument,
        query: z.string().describe("Text or regular expression to search for."),
        isRegularExpression: z
          .boolean()
          .optional()
          .describe("Treat the query as a regular expression (default false)."),
        maximumMatches: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe("Cap on reported matches (default 100)."),
      }),
      annotations: { readOnlyHint: true },
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
