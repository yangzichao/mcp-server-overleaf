/** "the 3 files in it (a.tex, b.tex, c.png)", listing at most ten. */
export function describeDirectoryFiles(files: readonly string[]): string {
  const shown = files.slice(0, 10).join(", ");
  const more = files.length > 10 ? ` and ${files.length - 10} more` : "";
  return `the ${files.length === 1 ? "1 file" : `${files.length} files`} in it (${shown}${more})`;
}

/** Git records files, never directories, so an empty one was never part of the project. */
export const EMPTY_DIRECTORY_NOTE =
  "It held no files, and Git records files rather than directories, so there is nothing to publish.";
