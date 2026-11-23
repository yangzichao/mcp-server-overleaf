/**
 * The part of a file TeX actually reads when another file includes it. Indices are into the
 * file's text; `tail` is the rest of an `\endinput` line, which TeX still reads.
 */
export interface InlinedRegion {
  readonly start: number;
  readonly end: number;
  readonly tailStart: number;
  readonly tailEnd: number;
}

const BEGIN_DOCUMENT_PATTERN = /\\begin\s*\{document\}/g;
const END_DOCUMENT_PATTERN = /\\end\s*\{document\}/g;
/** Only at the start of a line, as latexpand reads it, so a macro that contains it is left alone. */
const END_INPUT_PATTERN = /^[ \t]*\\endinput(?![A-Za-z])/gm;

function lineEndAt(text: string, from: number, limit: number): number {
  const newline = text.indexOf("\n", from);
  return newline === -1 || newline > limit ? limit : newline;
}

/**
 * What the subfiles package reads of a `\subfile`: the body between `\begin{document}` and
 * `\end{document}`, or the whole file when it has no document environment. A blank rest of
 * the `\begin` line, or blank space before `\end` on its line, is left out: inlined as an
 * empty line it would be a paragraph break TeX never saw.
 */
function subfileBody(masked: string): { start: number; end: number } {
  const beginPattern = new RegExp(BEGIN_DOCUMENT_PATTERN.source, "g");
  const begin = beginPattern.exec(masked);
  if (!begin) return { start: 0, end: masked.length };
  let start = begin.index + begin[0].length;
  const endPattern = new RegExp(END_DOCUMENT_PATTERN.source, "g");
  endPattern.lastIndex = start;
  let end = endPattern.exec(masked)?.index ?? masked.length;

  const firstLineEnd = lineEndAt(masked, start, end);
  if (firstLineEnd < end && masked.slice(start, firstLineEnd).trim() === "") start = firstLineEnd + 1;
  const lastLineStart = masked.lastIndexOf("\n", end - 1) + 1;
  if (lastLineStart > start && masked.slice(lastLineStart, end).trim() === "") end = lastLineStart;
  return masked.slice(start, end).trim() === "" ? { start, end: start } : { start, end };
}

/**
 * The region of a file to inline, given its masked text (comments blanked, same length).
 * `\endinput` ends the file after its own line: text after it on that line is kept, the
 * lines below are not. A bare `\endinput` line is dropped whole, so it leaves no blank line.
 */
export function findInlinedRegion(masked: string, isSubfile: boolean): InlinedRegion {
  const body = isSubfile ? subfileBody(masked) : { start: 0, end: masked.length };
  const endInputPattern = new RegExp(END_INPUT_PATTERN.source, "gm");
  endInputPattern.lastIndex = body.start;
  const endInput = endInputPattern.exec(masked);
  if (!endInput || endInput.index >= body.end) return { ...body, tailStart: body.end, tailEnd: body.end };

  const tokenEnd = endInput.index + endInput[0].length;
  const tailEnd = lineEndAt(masked, tokenEnd, body.end);
  if (masked.slice(tokenEnd, tailEnd).trim() === "") {
    return { start: body.start, end: endInput.index, tailStart: tailEnd, tailEnd };
  }
  return { start: body.start, end: tokenEnd - "\\endinput".length, tailStart: tokenEnd, tailEnd };
}
