import type { DocumentOperation } from "./overleafRealtimeSession.js";

/**
 * Turns "replace this exact text" into the operations Overleaf's editor applies, with the same
 * matching rules as replace_text over the Git bridge: literal, non-overlapping, left to right,
 * and exactly one match unless every one is wanted.
 */

export type ReplacementOperations =
  | { readonly status: "not-found" }
  | { readonly status: "ambiguous"; readonly occurrenceCount: number }
  | {
      readonly status: "replaced";
      readonly occurrenceCount: number;
      readonly operations: readonly DocumentOperation[];
    };

function findOccurrenceOffsets(text: string, findText: string): number[] {
  const offsets: number[] = [];
  for (
    let offset = text.indexOf(findText);
    offset !== -1;
    offset = text.indexOf(findText, offset + findText.length)
  ) {
    offsets.push(offset);
  }
  return offsets;
}

export function buildReplacementOperations(
  text: string,
  findText: string,
  replaceWith: string,
  replaceAll: boolean,
): ReplacementOperations {
  if (findText === "") throw new Error("findText is empty; give the exact text to replace.");
  const offsets = findOccurrenceOffsets(text, findText);
  if (offsets.length === 0) return { status: "not-found" };
  if (offsets.length > 1 && !replaceAll) return { status: "ambiguous", occurrenceCount: offsets.length };

  // Overleaf applies the operations of one update in order, each against the text the previous
  // one left. Working from the last match back means every offset is still where it was found.
  const operations: DocumentOperation[] = [];
  for (const offset of [...offsets].reverse()) {
    operations.push({ p: offset, d: findText });
    if (replaceWith !== "") operations.push({ p: offset, i: replaceWith });
  }
  return { status: "replaced", occurrenceCount: offsets.length, operations };
}
