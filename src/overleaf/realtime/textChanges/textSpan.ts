/** A stretch of the old text, and the stretch of the new text that replaces it. */
export interface TextSpan {
  readonly oldFrom: number;
  readonly oldTo: number;
  readonly newFrom: number;
  readonly newTo: number;
}

interface CommonEnds {
  readonly prefix: number;
  readonly suffix: number;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

/**
 * How many code units the two sides of `span` share at their start, and then at their end past
 * what the start took, never splitting a surrogate pair.
 */
export function commonEnds(oldText: string, newText: string, span: TextSpan): CommonEnds {
  const limit = Math.min(span.oldTo - span.oldFrom, span.newTo - span.newFrom);
  let prefix = 0;
  while (
    prefix < limit &&
    oldText.charCodeAt(span.oldFrom + prefix) === newText.charCodeAt(span.newFrom + prefix)
  ) {
    prefix += 1;
  }
  if (prefix > 0 && isHighSurrogate(oldText.charCodeAt(span.oldFrom + prefix - 1))) prefix -= 1;
  let suffix = 0;
  while (
    suffix < limit - prefix &&
    oldText.charCodeAt(span.oldTo - 1 - suffix) === newText.charCodeAt(span.newTo - 1 - suffix)
  ) {
    suffix += 1;
  }
  if (suffix > 0 && isLowSurrogate(oldText.charCodeAt(span.oldTo - suffix))) suffix -= 1;
  return { prefix, suffix };
}

/** The code units a change of `span` deletes and inserts, once its common ends are left out. */
export function changedLength(oldText: string, newText: string, span: TextSpan): number {
  const { prefix, suffix } = commonEnds(oldText, newText, span);
  return span.oldTo - span.oldFrom + (span.newTo - span.newFrom) - 2 * (prefix + suffix);
}
