/**
 * Lines startLine to endLine, each after its number. endLine is clamped to the file; a startLine
 * past the last line is refused, as blame refuses it, so an empty reply never stands for a range
 * the file does not have.
 */
export function numberLines(
  path: string,
  content: string,
  startLine: number | undefined,
  endLine: number | undefined,
): string {
  const lines = content.split("\n");
  const firstLine = startLine ?? 1;
  if (firstLine > lines.length) {
    throw new Error(
      `${path} has only ${lines.length} ${lines.length === 1 ? "line" : "lines"}, so line ${firstLine} is past the end.`,
    );
  }
  const lastLine = Math.min(lines.length, endLine ?? lines.length);
  return lines
    .slice(firstLine - 1, lastLine)
    .map((line, offset) => `${firstLine + offset}\t${line}`)
    .join("\n");
}
