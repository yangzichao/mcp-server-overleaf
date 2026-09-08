import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { categorizeProjectFiles, guessMainTexFile } from "../../latex/latexProjectFiles.js";
import { parseLatexSections } from "../../latex/parseLatexSections.js";
import { requireSynchronizedWithOverleaf } from "../../workflow/synchronizeWithOverleaf.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";

import { formatProjectInventory } from "./formatProjectInventory.js";

export function registerProjectInventoryTools(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_files",
    {
      title: "List project files",
      description:
        "Pull from Overleaf and list tracked files grouped by kind, including files hidden by sparse checkout. Optionally filter by extension and include unpublished new files.",
      inputSchema: z.object({
        project: z.string().optional(),
        extension: z
          .string()
          .regex(/^\.?[A-Za-z0-9]+$/)
          .optional()
          .describe("Case-insensitive extension, e.g. tex or .bib; omitted lists all kinds."),
        includeUntracked: z
          .boolean()
          .optional()
          .describe("Also list new local files, excluding ignored build artifacts (default false)."),
      }),
      annotations: { readOnlyHint: true },
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
        "Pull from Overleaf and return a JSON overview: file counts, likely main document and its section count, first ten files, pending diff statistics, and new unpublished files.",
      inputSchema: z.object({ project: z.string().optional() }),
      annotations: { readOnlyHint: true },
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
          return textResult(
            JSON.stringify({
              totalFiles: files.length,
              trackedFiles: trackedFiles.length,
              categories,
              mainFile,
              totalSections: mainFile
                ? parseLatexSections(await repository.readTextFile(mainFile)).length
                : 0,
              sectionCountScope: "mainFile",
              files: files.slice(0, 10),
              localChanges: await repository.getPendingDiffStatistics(),
              untrackedFiles,
            }),
          );
        }),
      ),
  );
}
