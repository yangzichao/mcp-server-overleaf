import { categorizeProjectFiles, guessMainTexFile } from "../../latex/latexProjectFiles.js";

export function formatProjectInventory(
  files: string[],
  trackedFiles: string[],
  untrackedFiles: string[],
  suffix: string | undefined,
): string {
  const groups = new Map<string, string[]>();
  for (const file of categorizeProjectFiles(files)) {
    const bucket = groups.get(file.category) ?? [];
    bucket.push(`${file.path}${untrackedFiles.includes(file.path) ? " (untracked)" : ""}`);
    groups.set(file.category, bucket);
  }
  const renderedGroups = [...groups]
    .map(
      ([category, paths]) => `${category} (${paths.length}):\n${paths.map((path) => `  ${path}`).join("\n")}`,
    )
    .join("\n\n");
  return `${files.length} ${untrackedFiles.length ? "tracked or untracked" : "tracked"} files${suffix ? ` matching ${suffix}` : ""}. Likely main document: ${guessMainTexFile(trackedFiles) ?? "unknown"}\n\n${renderedGroups}`;
}
