/** startLine alone reads to the end; endLine is clamped to the file. */
export function numberLines(
  content: string,
  startLine: number | undefined,
  endLine: number | undefined,
): string {
  const lines = content.split("\n");
  const firstLine = startLine ?? 1;
  const lastLine = Math.min(lines.length, endLine ?? lines.length);
  return lines
    .slice(firstLine - 1, lastLine)
    .map((line, offset) => `${firstLine + offset}\t${line}`)
    .join("\n");
}
