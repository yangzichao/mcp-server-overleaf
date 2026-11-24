/**
 * The text an append leaves: content after the file's last line, starting a line of its own. A
 * newline is added only when the file does not already end with one, and none is added after
 * content, so the caller decides whether the file ends with a newline.
 */
export function appendOnNewLine(originalText: string, content: string): string {
  if (originalText === "" || originalText.endsWith("\n")) return `${originalText}${content}`;
  return `${originalText}\n${content}`;
}

/** "1 line" or "3 lines", counting a final line without its newline. */
export function describeAppendedLines(content: string): string {
  const lineCount = content.replace(/\n$/, "").split("\n").length;
  return lineCount === 1 ? "1 line" : `${lineCount} lines`;
}

/** The refusal for a file that is not there, which is a job for write. */
export function describeMissingAppendTarget(path: string): string {
  return `${path} does not exist, so there is nothing to append to. Nothing was written; use action write to create it.`;
}
