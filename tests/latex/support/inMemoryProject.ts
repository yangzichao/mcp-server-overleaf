import type { ProjectSourceReader } from "../../../src/latex/includes/walkIncludedFiles.js";

/**
 * A project held in memory for the LaTeX checks. Binary files are named with no content,
 * because the checks only ever ask whether they exist.
 */
export function inMemoryProject(
  textFiles: Record<string, string>,
  binaryFiles: readonly string[] = [],
): ProjectSourceReader & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    projectFiles: new Set([...Object.keys(textFiles), ...binaryFiles]),
    readTextFile(path: string): Promise<string> {
      reads.push(path);
      const content = textFiles[path];
      return content === undefined
        ? Promise.reject(new Error(`No text file at ${path}`))
        : Promise.resolve(content);
    },
  };
}
