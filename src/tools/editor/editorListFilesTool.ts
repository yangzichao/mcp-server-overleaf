import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { categorizeProjectFiles } from "../../latex/latexProjectFiles.js";
import type { OverleafProjectTree } from "../../overleaf/realtime/overleafProjectDocuments.js";
import { projectArgument } from "../projectArgument.js";
import { withReviewSession } from "../review/openReviewSession.js";
import { READS_OVERLEAF } from "../toolAnnotations.js";
import { runToolSafely, type ToolContext, textResult } from "../toolContext.js";
import { NO_GIT_BRIDGE_NOTE } from "./editorFileArguments.js";

function describeProjectFiles(tree: OverleafProjectTree, suffix: string | undefined): string {
  const binaryPaths = new Set(tree.binaryFiles.map((file) => file.path));
  const paths = [...tree.documents, ...tree.binaryFiles]
    .map((entry) => entry.path)
    .filter((path) => !suffix || path.toLowerCase().endsWith(suffix))
    .sort();
  const groups = new Map<string, string[]>();
  for (const file of categorizeProjectFiles(paths)) {
    const bucket = groups.get(file.category) ?? [];
    bucket.push(`${file.path}${binaryPaths.has(file.path) ? " (binary)" : ""}`);
    groups.set(file.category, bucket);
  }
  const mainDocument = tree.documents.find((document) => document.documentId === tree.rootDocumentId)?.path;
  const renderedGroups = [...groups]
    .map(
      ([category, entries]) =>
        `${category} (${entries.length}):\n${entries.map((entry) => `  ${entry}`).join("\n")}`,
    )
    .join("\n\n");
  return `${paths.length} files${suffix ? ` matching ${suffix}` : ""} in "${tree.name}". Main document: ${mainDocument ?? "not set"}\n\n${renderedGroups}`;
}

export function registerEditorListFilesTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "list_files",
    {
      title: "List project files",
      description:
        "List every file in the project, grouped by kind (LaTeX sources, bibliographies, figures, other), as Overleaf's file tree shows it now. " +
        `${NO_GIT_BRIDGE_NOTE} ` +
        "Use it to find exact paths before read_file or replace_text. Files marked (binary) are uploads such as images; read_file cannot read them, download_project_zip can. " +
        "extension keeps only paths ending in that suffix, case-insensitively. Returns the file count and the main document set in Overleaf, then the paths under each kind.",
      inputSchema: z.object({
        project: projectArgument,
        extension: z
          .string()
          .regex(/^\.?[A-Za-z0-9]+$/)
          .optional()
          .describe("Case-insensitive extension, e.g. tex or .bib; omitted lists all kinds."),
      }),
      annotations: READS_OVERLEAF,
    },
    async ({ project, extension }) =>
      runToolSafely(context, () =>
        withReviewSession(context, project, (session) => {
          const suffix = extension ? `.${extension.replace(/^\./, "").toLowerCase()}` : undefined;
          return Promise.resolve(textResult(describeProjectFiles(session.project, suffix)));
        }),
      ),
  );
}
