import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { replaceTextOccurrences } from "../../../src/latex/replaceTextOccurrences.js";
import { latexFragment, latexText } from "../support/latexArbitraries.js";

function nonOverlappingOffsets(text: string, findText: string): number[] {
  const offsets: number[] = [];
  let offset = 0;
  while (offset <= text.length - findText.length) {
    if (text.startsWith(findText, offset)) {
      offsets.push(offset);
      offset += findText.length;
    } else {
      offset += 1;
    }
  }
  return offsets;
}

function replaceAtOffsets(text: string, offsets: readonly number[], length: number, replaceWith: string) {
  let result = "";
  let cursor = 0;
  for (const offset of offsets) {
    result += text.slice(cursor, offset) + replaceWith;
    cursor = offset + length;
  }
  return result + text.slice(cursor);
}

const replacementText = fc.oneof(latexText, fc.constantFrom("$&", "$1", "$$", "$`", "$'", "$$x$$", ""));

/** Original text and a non-empty find string, which is usually taken from the text so it is found. */
const textWithFindText = latexText.chain((originalContent) =>
  fc.record({
    originalContent: fc.constant(originalContent),
    findText: fc.oneof(
      fc
        .tuple(fc.nat(originalContent.length), fc.integer({ min: 1, max: 6 }))
        .map(([start, length]) => originalContent.slice(start, start + length)),
      latexFragment,
    ),
  }),
);
const replaceArguments = fc
  .record({ textAndFind: textWithFindText, replaceWith: replacementText, replaceAll: fc.boolean() })
  .filter(({ textAndFind }) => textAndFind.findText !== "");

describe("replaceTextOccurrences properties", () => {
  it("decides not-found, ambiguous or replaced from the non-overlapping occurrence count", () => {
    fc.assert(
      fc.property(
        replaceArguments,
        ({ textAndFind: { originalContent, findText }, replaceWith, replaceAll }) => {
          const count = nonOverlappingOffsets(originalContent, findText).length;
          const result = replaceTextOccurrences(originalContent, findText, replaceWith, replaceAll);
          if (count === 0) expect(result).toEqual({ status: "not-found" });
          else if (count > 1 && !replaceAll)
            expect(result).toEqual({ status: "ambiguous", occurrenceCount: count });
          else expect(result).toMatchObject({ status: "replaced", occurrenceCount: count });
        },
      ),
    );
  });

  it("puts the replacement in literally and leaves every character outside the matches as it was", () => {
    fc.assert(
      fc.property(
        replaceArguments,
        ({ textAndFind: { originalContent, findText }, replaceWith, replaceAll }) => {
          const offsets = nonOverlappingOffsets(originalContent, findText);
          const result = replaceTextOccurrences(originalContent, findText, replaceWith, replaceAll);
          if (result.status !== "replaced") return;
          expect(result.updatedContent).toBe(
            replaceAtOffsets(originalContent, offsets, findText.length, replaceWith),
          );
        },
      ),
    );
  });

  it("is undone by replacing a fresh marker back with the find text", () => {
    const marker = "";
    fc.assert(
      fc.property(textWithFindText, ({ originalContent, findText }) => {
        fc.pre(findText !== "" && !originalContent.includes(marker) && !findText.includes(""));
        const forward = replaceTextOccurrences(originalContent, findText, marker, true);
        if (forward.status !== "replaced") return;
        const backward = replaceTextOccurrences(forward.updatedContent, marker, findText, true);
        expect(backward).toMatchObject({
          status: "replaced",
          occurrenceCount: forward.occurrenceCount,
          updatedContent: originalContent,
        });
      }),
    );
  });
});
