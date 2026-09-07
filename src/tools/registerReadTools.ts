import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { categorizeProjectFiles, guessMainTexFile } from "../latex/latexProjectFiles.js";
import { extractSectionText, findSectionByTitle, parseLatexSections } from "../latex/parseLatexSections.js";
import { formatSearchMatches, searchProjectFiles } from "../latex/searchProjectFiles.js";
import { synchronizeWithOverleaf } from "../workflow/synchronizeWithOverleaf.js";
import { runToolSafely, type ToolContext, textResult, truncateForModel } from "./toolContext.js";

const projectArgument = z
  .string()
  .optional()
  .describe(
    "Registered project name, or a 24-character Overleaf project id. Omit to use the default project.",
  );

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
          return textResult(
            "No projects are registered. Set OVERLEAF_PROJECTS (for example `paper=64a1b2c3d4e5f6a7b8c9d0e1`), " +
              "or pass a 24-character Overleaf project id directly as the `project` argument.",
          );
        }
        const defaultName = context.configuration.defaultProjectName;
        return textResult(
          names.map((name) => `- ${name}${name === defaultName ? "  (default)" : ""}`).join("\n"),
        );
      }),
  );

  server.registerTool(
    "list_files",
    {
      title: "List project files",
      description:
        "Pull the latest version from Overleaf and list the files in the project, grouped by kind (tex, bibliography, figures, styles).",
      inputSchema: z.object({ project: projectArgument }),
      annotations: { readOnlyHint: true },
    },
    async ({ project }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await synchronizeWithOverleaf(repository);

          const files = await repository.listTrackedFiles();
          const categorized = categorizeProjectFiles(files);
          const groups = new Map<string, string[]>();
          for (const file of categorized) {
            const bucket = groups.get(file.category) ?? [];
            bucket.push(file.path);
            groups.set(file.category, bucket);
          }

          const mainTexFile = guessMainTexFile(files);
          const renderedGroups = [...groups.entries()]
            .map(
              ([category, paths]) =>
                `${category} (${paths.length}):\n${paths.map((path) => `  ${path}`).join("\n")}`,
            )
            .join("\n\n");

          return textResult(
            `${files.length} tracked files. Likely main document: ${mainTexFile ?? "unknown"}\n\n${renderedGroups}`,
          );
        }),
      ),
  );

  server.registerTool(
    "read_file",
    {
      title: "Read a project file",
      description:
        "Pull the latest version from Overleaf and read a text file from the project. Optionally restrict to a line range.",
      inputSchema: z.object({
        project: projectArgument,
        path: z.string().describe("Path relative to the project root, e.g. sections/introduction.tex"),
        startLine: z.number().int().positive().optional().describe("First line to return (1-indexed)."),
        endLine: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Last line to return (1-indexed, inclusive)."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ project, path, startLine, endLine }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await synchronizeWithOverleaf(repository);

          const fileContent = await repository.readTextFile(path);
          if (startLine === undefined && endLine === undefined) {
            return textResult(truncateForModel(fileContent));
          }

          const lines = fileContent.split("\n");
          const firstLine = Math.max(1, startLine ?? 1);
          const lastLine = Math.min(lines.length, endLine ?? lines.length);
          const selected = lines
            .slice(firstLine - 1, lastLine)
            .map((line, offset) => `${firstLine + offset}\t${line}`)
            .join("\n");
          return textResult(truncateForModel(selected));
        }),
      ),
  );

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
          await synchronizeWithOverleaf(repository);

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
          await synchronizeWithOverleaf(repository);

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
          await synchronizeWithOverleaf(repository);

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
