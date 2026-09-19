import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { categorizeProjectFiles, guessMainTexFile } from "../../latex/latexProjectFiles.js";
import { parseLatexSections } from "../../latex/parseLatexSections.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { projectArgument } from "../projectArgument.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, structuredResult, type ToolContext, textResult } from "../toolContext.js";

import { formatProjectInventory } from "./formatProjectInventory.js";
import { projectSummarySchema } from "./projectSummarySchema.js";

export function registerProjectInventoryTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_files",
    {
      title: "List project files",
      description:
        "List every file in the project, grouped by kind (LaTeX sources, bibliographies, figures, other). " +
        "Pulls the latest commits from Overleaf first, so the listing reflects what collaborators have pushed. " +
        "Files hidden by sparse checkout are listed too, because they exist in the project even when not on disk. " +
        "Use this to discover paths before reading or editing; use project_summary instead for counts and the likely main document.",
      inputSchema: z.object({
        project: projectArgument,
        extension: z
          .string()
          .regex(/^\.?[A-Za-z0-9]+$/)
          .optional()
          .describe("Case-insensitive extension, e.g. tex or .bib; omitted lists all kinds."),
        includeUntracked: z
          .boolean()
          .optional()
          .describe(
            "Also list files created locally and not yet pushed to Overleaf, excluding ignored build artifacts (default false).",
          ),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, extension, includeUntracked }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);
          const trackedFiles = await repository.listTrackedFiles();
          const untrackedFiles = includeUntracked ? await repository.listUntrackedFiles() : [];
          const suffix = extension ? `.${extension.replace(/^\./, "").toLowerCase()}` : undefined;
          const files = [...new Set([...trackedFiles, ...untrackedFiles])]
            .filter((path) => !suffix || path.toLowerCase().endsWith(suffix))
            .sort();
          return textResult(formatProjectInventory(files, trackedFiles, untrackedFiles, suffix));
        }),
      ),
  );

  server.registerTool(
    "project_summary",
    {
      title: "Project summary",
      description:
        "Get a JSON overview of the project: file counts by kind, the likely main document and how many sections it has, " +
        "the first ten file paths, statistics for edits not yet pushed, and files created locally. " +
        "Pulls from Overleaf first. Call this once at the start of a task to orient; " +
        "totalSections counts only the main document, not every .tex file.",
      inputSchema: z.object({ project: projectArgument }),
      outputSchema: projectSummarySchema,
      annotations: READS_OVERLEAF,
    },
    async ({ project }) =>
      runToolSafely(context, () =>
        context.projectRegistry.withRepository(project, async (repository) => {
          await requireSynchronizedWithOverleaf(repository);
          const trackedFiles = await repository.listTrackedFiles();
          const untrackedFiles = await repository.listUntrackedFiles();
          const files = [...new Set([...trackedFiles, ...untrackedFiles])].sort();
          const mainFile = guessMainTexFile(files);
          const categories: Record<string, number> = {};
          for (const file of categorizeProjectFiles(files))
            categories[file.category] = (categories[file.category] ?? 0) + 1;
          return structuredResult({
            totalFiles: files.length,
            trackedFiles: trackedFiles.length,
            categories,
            mainFile,
            totalSections: mainFile ? parseLatexSections(await repository.readTextFile(mainFile)).length : 0,
            sectionCountScope: "mainFile" as const,
            files: files.slice(0, 10),
            localChanges: await repository.getPendingDiffStatistics(),
            untrackedFiles,
          });
        }),
      ),
  );
}
