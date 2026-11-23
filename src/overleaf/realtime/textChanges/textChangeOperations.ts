import { findChangedLineRanges } from "./changedLineRanges.js";
import { cheapestRuns, type Run } from "./cheapestRuns.js";
import { changedLength, commonEnds, type TextSpan } from "./textSpan.js";

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

/** Where each run of changed lines is in the old text and in the new one. */
function changedLineSpans(oldText: string, newText: string): TextSpan[] {
  const oldLines = splitKeepingLineEnds(oldText);
  const newLines = splitKeepingLineEnds(newText);
  const oldStarts = lineStartOffsets(oldLines);
  const newStarts = lineStartOffsets(newLines);
  return findChangedLineRanges(oldLines, newLines).map((range) => ({
    oldFrom: oldStarts[range.oldStart] ?? 0,
    oldTo: oldStarts[range.oldEnd] ?? oldText.length,
    newFrom: newStarts[range.newStart] ?? 0,
    newTo: newStarts[range.newEnd] ?? newText.length,
  }));
}

/** One span from the start of the first to the end of the last, the lines between included. */
function spanAcross({ first, last }: Run<TextSpan>): TextSpan {
  return { oldFrom: first.oldFrom, oldTo: last.oldTo, newFrom: first.newFrom, newTo: last.newTo };
}

/** Deletes and inserts what differs between the two sides of `span`, less what their ends share. */
function trimmedOperations(oldText: string, newText: string, span: TextSpan): TextChangeOperation[] {
  const { prefix, suffix } = commonEnds(oldText, newText, span);
  const deleted = oldText.slice(span.oldFrom + prefix, span.oldTo - suffix);
  const inserted = newText.slice(span.newFrom + prefix, span.newTo - suffix);
  const position = span.oldFrom + prefix;
  const operations: TextChangeOperation[] = [];
  if (deleted !== "") operations.push({ p: position, d: deleted });
  if (inserted !== "") operations.push({ p: position, i: inserted });
  return operations;
}

/**
 * The deletions and insertions that turn `oldText` into `newText` in Overleaf's editor. It
 * compares lines first, then trims the characters each changed run of lines has in common, so
 * an edited word becomes a small change rather than a rewritten line. An edit that joins or
 * splits lines can make a line its neighbour already is, and the line diff then keeps that
 * neighbour and rewrites the lines on each side; neighbouring runs, with the lines between
 * them, are sent as one change wherever that is smaller, and so is the whole edit.
 *
 * Positions count UTF-16 code units, as Overleaf does, and a surrogate pair is never split.
 * Overleaf applies the operations of one update in order, each against the text the previous
 * one left, so they run from the end of the document backwards: every position is still where
 * it was in `oldText`. Identical texts give no operations.
 */
export function buildTextChangeOperations(oldText: string, newText: string): TextChangeOperation[] {
  if (oldText === newText) return [];
  const grouped = cheapestRuns(changedLineSpans(oldText, newText), (run) =>
    changedLength(oldText, newText, spanAcross(run)),
  );
  const whole: TextSpan = { oldFrom: 0, oldTo: oldText.length, newFrom: 0, newTo: newText.length };
  const spans =
    changedLength(oldText, newText, whole) < grouped.cost ? [whole] : grouped.runs.map(spanAcross);
  return spans.reverse().flatMap((span) => trimmedOperations(oldText, newText, span));
}
