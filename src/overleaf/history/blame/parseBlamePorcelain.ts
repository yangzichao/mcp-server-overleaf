/** One line of `git blame --porcelain` output: the commit it came from, its number now, its text. */
export interface PorcelainBlameLine {
  readonly hash: string;
  readonly lineNumber: number;
  readonly text: string;
}

/** Git names a line that is changed in the working tree and not committed by this hash. */
export const UNCOMMITTED_HASH_PATTERN = /^0+$/;

/** `<hash> <line in that commit> <line now> [<lines in this group>]`, the first row of each entry. */
const ENTRY_HEADER_PATTERN = /^([0-9a-f]{40}|[0-9a-f]{64}) \d+ (\d+)(?: \d+)?$/;

/**
 * Reads the hash, final line number and text of each line. The details git prints once per
 * commit (author, summary and so on) are skipped; they are read with `git show` instead, in
 * the same form the commit log uses. A text row always starts with a tab, so file content can
 * never be mistaken for a header. A CRLF file's trailing `\r` is dropped from the text.
 */
export function parseBlamePorcelain(output: string): PorcelainBlameLine[] {
  const lines: PorcelainBlameLine[] = [];
  let entry: { hash: string; lineNumber: number } | undefined;
  for (const row of output.split("\n")) {
    if (entry && row.startsWith("\t")) {
      lines.push({ ...entry, text: row.slice(1).replace(/\r$/, "") });
      entry = undefined;
      continue;
    }
    const header = entry ? null : ENTRY_HEADER_PATTERN.exec(row);
    if (header?.[1] && header[2]) entry = { hash: header[1], lineNumber: Number(header[2]) };
  }
  return lines;
}
