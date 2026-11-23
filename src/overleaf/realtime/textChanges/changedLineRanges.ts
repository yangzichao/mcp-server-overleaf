/** Old lines `[oldStart, oldEnd)` became new lines `[newStart, newEnd)`; either side may be empty. */
export interface ChangedLineRange {
  readonly oldStart: number;
  readonly oldEnd: number;
  readonly newStart: number;
  readonly newEnd: number;
}

/**
 * Past this many changed lines the diff stops looking for the smallest edit and treats
 * everything between the common first and last lines as one change. The search keeps one
 * array per step, so the cap bounds its memory at about 16 MB.
 */
export const MAXIMUM_LINE_EDIT_DISTANCE = 2000;

function valueAt(values: Int32Array, index: number): number {
  return values[index] ?? 0;
}

function toLineIds(lines: readonly string[], idsByLine: Map<string, number>): Int32Array {
  const ids = new Int32Array(lines.length);
  lines.forEach((line, index) => {
    let id = idsByLine.get(line);
    if (id === undefined) {
      id = idsByLine.size;
      idsByLine.set(line, id);
    }
    ids[index] = id;
  });
  return ids;
}

interface EditSearch {
  readonly oldIds: Int32Array;
  readonly newIds: Int32Array;
  /** The furthest old-line index reached on diagonal `k`, at index `k + offset`. */
  readonly furthest: Int32Array;
  readonly offset: number;
}

/** How far one more edit gets along `diagonal`, following equal lines as far as they go. */
function extendDiagonal(search: EditSearch, diagonal: number, distance: number): number {
  const { oldIds, newIds, furthest, offset } = search;
  const comesFromAbove =
    diagonal === -distance ||
    (diagonal !== distance &&
      valueAt(furthest, offset + diagonal - 1) < valueAt(furthest, offset + diagonal + 1));
  let oldIndex = comesFromAbove
    ? valueAt(furthest, offset + diagonal + 1)
    : valueAt(furthest, offset + diagonal - 1) + 1;
  let newIndex = oldIndex - diagonal;
  while (oldIndex < oldIds.length && newIndex < newIds.length && oldIds[oldIndex] === newIds[newIndex]) {
    oldIndex += 1;
    newIndex += 1;
  }
  return oldIndex;
}

/**
 * Myers' greedy search. `trace[d]` holds the furthest old-line index reached on each diagonal
 * `k` in `[-d, d]` after `d` edits, stored at index `k + d`. Returns undefined past the cap.
 */
function traceShortestEdit(oldIds: Int32Array, newIds: Int32Array): Int32Array[] | undefined {
  const offset = oldIds.length + newIds.length + 1;
  const search: EditSearch = { oldIds, newIds, furthest: new Int32Array(2 * offset + 1), offset };
  const trace: Int32Array[] = [];
  for (let distance = 0; distance <= MAXIMUM_LINE_EDIT_DISTANCE; distance += 1) {
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const oldIndex = extendDiagonal(search, diagonal, distance);
      search.furthest[offset + diagonal] = oldIndex;
      if (oldIndex >= oldIds.length && oldIndex - diagonal >= newIds.length) {
        trace.push(search.furthest.slice(offset - distance, offset + distance + 1));
        return trace;
      }
    }
    trace.push(search.furthest.slice(offset - distance, offset + distance + 1));
  }
  return undefined;
}

/** Walks the trace back from the end, joining edits that touch into ranges. */
function rangesFromTrace(
  trace: readonly Int32Array[],
  oldLength: number,
  newLength: number,
): ChangedLineRange[] {
  const ranges: ChangedLineRange[] = [];
  let open: { oldStart: number; oldEnd: number; newStart: number; newEnd: number } | undefined;
  let oldIndex = oldLength;
  let newIndex = newLength;
  for (let distance = trace.length - 1; distance > 0; distance -= 1) {
    const previous = trace[distance - 1] ?? new Int32Array();
    const at = (diagonal: number) => valueAt(previous, diagonal + distance - 1);
    const diagonal = oldIndex - newIndex;
    const comesFromAbove =
      diagonal === -distance || (diagonal !== distance && at(diagonal - 1) < at(diagonal + 1));
    const previousDiagonal = comesFromAbove ? diagonal + 1 : diagonal - 1;
    const previousOld = at(previousDiagonal);
    const previousNew = previousOld - previousDiagonal;
    const editEndOld = comesFromAbove ? previousOld : previousOld + 1;
    const editEndNew = comesFromAbove ? previousNew + 1 : previousNew;
    if (open && oldIndex > editEndOld) {
      ranges.push(open);
      open = undefined;
    }
    open ??= { oldStart: editEndOld, oldEnd: editEndOld, newStart: editEndNew, newEnd: editEndNew };
    open.oldStart = previousOld;
    open.newStart = previousNew;
    oldIndex = previousOld;
    newIndex = previousNew;
  }
  if (open) ranges.push(open);
  return ranges.reverse();
}

/**
 * The line ranges that differ between two texts, as few changed lines as Myers' algorithm
 * finds, in order. Lines that are the same at both ends are skipped before the search.
 */
export function findChangedLineRanges(
  oldLines: readonly string[],
  newLines: readonly string[],
): ChangedLineRange[] {
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);
  if (oldMiddle.length === 0 && newMiddle.length === 0) return [];

  const idsByLine = new Map<string, number>();
  const trace = traceShortestEdit(toLineIds(oldMiddle, idsByLine), toLineIds(newMiddle, idsByLine));
  const middleRanges = trace
    ? rangesFromTrace(trace, oldMiddle.length, newMiddle.length)
    : [{ oldStart: 0, oldEnd: oldMiddle.length, newStart: 0, newEnd: newMiddle.length }];
  return middleRanges.map((range) => ({
    oldStart: range.oldStart + prefix,
    oldEnd: range.oldEnd + prefix,
    newStart: range.newStart + prefix,
    newEnd: range.newEnd + prefix,
  }));
}
