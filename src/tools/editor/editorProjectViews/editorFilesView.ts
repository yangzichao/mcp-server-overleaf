import { categorizeProjectFiles } from "../../../latex/latexProjectFiles.js";
import type { OverleafProjectTree } from "../../../overleaf/realtime/overleafProjectDocuments.js";

export function findMainDocumentPath(tree: OverleafProjectTree): string | undefined {
  return tree.documents.find((document) => document.documentId === tree.rootDocumentId)?.path;
}

/** Overleaf's file tree grouped by kind, with uploads marked (binary). */
export function describeEditorFiles(tree: OverleafProjectTree, extension: string | undefined): string {
  const suffix = extension ? `.${extension.replace(/^\./, "").toLowerCase()}` : undefined;
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
  const renderedGroups = [...groups]
    .map(
      ([category, entries]) =>
        `${category} (${entries.length}):\n${entries.map((entry) => `  ${entry}`).join("\n")}`,
    )
    .join("\n\n");
  return `${paths.length} files${suffix ? ` matching ${suffix}` : ""} in "${tree.name}". Main document: ${findMainDocumentPath(tree) ?? "not set"}\n\n${renderedGroups}`;
}
