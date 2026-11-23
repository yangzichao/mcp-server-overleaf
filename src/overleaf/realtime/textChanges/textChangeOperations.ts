import { type ChangedLineRange, findChangedLineRanges } from "./changedLineRanges.js";

/** The insert and delete components of Overleaf's text operations; both fit `DocumentOperation`. */
export type TextChangeOperation =
  | { readonly p: number; readonly d: string }
  | { readonly p: number; readonly i: string };

/** Lines with their own `\n` (or `\r\n`) kept, so joining them gives the text back. */
function splitKeepingLineEnds(text: string): string[] {
  return text === "" ? [] : text.split(/(?<=\n)/);
}

/** `starts[i]` is where line `i` begins; the last entry is the text's length. */
function lineStartOffsets(lines: readonly string[]): number[] {
  const starts = [0];
  for (const line of lines) starts.push((starts.at(-1) ?? 0) + line.length);
  return starts;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

/** Common leading code units, never ending between the two halves of a surrogate pair. */
function commonPrefixLength(first: string, second: string): number {
  const limit = Math.min(first.length, second.length);
  let length = 0;
  while (length < limit && first.charCodeAt(length) === second.charCodeAt(length)) length += 1;
  if (length > 0 && isHighSurrogate(first.charCodeAt(length - 1))) length -= 1;
  return length;
}

/** Common trailing code units after `skip` leading ones, never starting on a low surrogate. */
function commonSuffixLength(first: string, second: string, skip: number): number {
  const limit = Math.min(first.length, second.length) - skip;
  let length = 0;
  while (
    length < limit &&
    first.charCodeAt(first.length - 1 - length) === second.charCodeAt(second.length - 1 - length)
  ) {
    length += 1;
  }
  if (length > 0 && isLowSurrogate(first.charCodeAt(first.length - length))) length -= 1;
  return length;
}

function operationsForRange(
  range: ChangedLineRange,
  oldText: string,
  newText: string,
  oldStarts: readonly number[],
  newStarts: readonly number[],
): TextChangeOperation[] {
  const oldFrom = oldStarts[range.oldStart] ?? 0;
  const oldSegment = oldText.slice(oldFrom, oldStarts[range.oldEnd]);
  const newSegment = newText.slice(newStarts[range.newStart], newStarts[range.newEnd]);
  const prefix = commonPrefixLength(oldSegment, newSegment);
  const suffix = commonSuffixLength(oldSegment, newSegment, prefix);
  const deleted = oldSegment.slice(prefix, oldSegment.length - suffix);
  const inserted = newSegment.slice(prefix, newSegment.length - suffix);
  const position = oldFrom + prefix;
  const operations: TextChangeOperation[] = [];
  if (deleted !== "") operations.push({ p: position, d: deleted });
  if (inserted !== "") operations.push({ p: position, i: inserted });
  return operations;
}

/**
 * The deletions and insertions that turn `oldText` into `newText` in Overleaf's editor. It
 * compares lines first, then trims the characters each changed run of lines has in common, so
 * an edited word becomes a small change rather than a rewritten line.
 *
 * Positions count UTF-16 code units, as Overleaf does, and a surrogate pair is never split.
 * Overleaf applies the operations of one update in order, each against the text the previous
 * one left, so they run from the end of the document backwards: every position is still where
 * it was in `oldText`. Identical texts give no operations.
 */
export function buildTextChangeOperations(oldText: string, newText: string): TextChangeOperation[] {
  if (oldText === newText) return [];
  const oldLines = splitKeepingLineEnds(oldText);
  const newLines = splitKeepingLineEnds(newText);
  const oldStarts = lineStartOffsets(oldLines);
  const newStarts = lineStartOffsets(newLines);
  return findChangedLineRanges(oldLines, newLines)
    .reverse()
    .flatMap((range) => operationsForRange(range, oldText, newText, oldStarts, newStarts));
}
