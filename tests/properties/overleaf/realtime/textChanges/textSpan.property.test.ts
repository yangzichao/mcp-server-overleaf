import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  changedLength,
  commonEnds,
  type TextSpan,
} from "../../../../../src/overleaf/realtime/textChanges/textSpan.js";

const text = fc
  .array(fc.constantFrom("a", "b", "😀", "😁", "𝔸", "\ud83d", "\ude00", "é", "\n"), { maxLength: 10 })
  .map((pieces) => pieces.join(""));

const spanOver = (oldText: string, newText: string): fc.Arbitrary<TextSpan> =>
  fc
    .tuple(
      fc.integer({ min: 0, max: oldText.length }),
      fc.integer({ min: 0, max: oldText.length }),
      fc.integer({ min: 0, max: newText.length }),
      fc.integer({ min: 0, max: newText.length }),
    )
    .map(([oldA, oldB, newA, newB]) => ({
      oldFrom: Math.min(oldA, oldB),
      oldTo: Math.max(oldA, oldB),
      newFrom: Math.min(newA, newB),
      newTo: Math.max(newA, newB),
    }));

const textsAndSpan = fc
  .tuple(text, text)
  .chain(([oldText, newText]) =>
    fc.tuple(fc.constant(oldText), fc.constant(newText), spanOver(oldText, newText)),
  );
const similarTextsAndSpan = fc
  .tuple(text, text, text, text)
  .map(
    ([start, oldMiddle, newMiddle, end]) =>
      [`${start}${oldMiddle}${end}`, `${start}${newMiddle}${end}`] as const,
  )
  .map(
    ([oldText, newText]) =>
      [oldText, newText, { oldFrom: 0, oldTo: oldText.length, newFrom: 0, newTo: newText.length }] as const,
  );

function splitsSurrogatePair(written: string, index: number): boolean {
  const before = written.charCodeAt(index - 1);
  const after = written.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

function longestCommonPrefix(oldText: string, newText: string, span: TextSpan, limit: number): number {
  let length = 0;
  while (length < limit && oldText[span.oldFrom + length] === newText[span.newFrom + length]) length += 1;
  return length;
}

describe("commonEnds properties", () => {
  it("finds a common prefix and suffix that fit in both spans without overlapping", () => {
    fc.assert(
      fc.property(fc.oneof(textsAndSpan, similarTextsAndSpan), ([oldText, newText, span]) => {
        const { prefix, suffix } = commonEnds(oldText, newText, span);
        expect(prefix).toBeGreaterThanOrEqual(0);
        expect(suffix).toBeGreaterThanOrEqual(0);
        expect(prefix + suffix).toBeLessThanOrEqual(
          Math.min(span.oldTo - span.oldFrom, span.newTo - span.newFrom),
        );
        expect(oldText.slice(span.oldFrom, span.oldFrom + prefix)).toBe(
          newText.slice(span.newFrom, span.newFrom + prefix),
        );
        expect(oldText.slice(span.oldTo - suffix, span.oldTo)).toBe(
          newText.slice(span.newTo - suffix, span.newTo),
        );
      }),
    );
  });

  it("never ends the prefix or starts the suffix inside a surrogate pair, in either text", () => {
    fc.assert(
      fc.property(fc.oneof(textsAndSpan, similarTextsAndSpan), ([oldText, newText, span]) => {
        const { prefix, suffix } = commonEnds(oldText, newText, span);
        if (prefix > 0) {
          expect(splitsSurrogatePair(oldText, span.oldFrom + prefix)).toBe(false);
          expect(splitsSurrogatePair(newText, span.newFrom + prefix)).toBe(false);
        }
        if (suffix > 0) {
          expect(splitsSurrogatePair(oldText, span.oldTo - suffix)).toBe(false);
          expect(splitsSurrogatePair(newText, span.newTo - suffix)).toBe(false);
        }
      }),
    );
  });

  it("gives up at most one code unit of the longest common prefix, and only to keep a pair whole", () => {
    fc.assert(
      fc.property(fc.oneof(textsAndSpan, similarTextsAndSpan), ([oldText, newText, span]) => {
        const limit = Math.min(span.oldTo - span.oldFrom, span.newTo - span.newFrom);
        const longest = longestCommonPrefix(oldText, newText, span, limit);
        const { prefix } = commonEnds(oldText, newText, span);
        const lastUnit = oldText.charCodeAt(span.oldFrom + longest - 1);
        const endsOnHighSurrogate = longest > 0 && lastUnit >= 0xd800 && lastUnit <= 0xdbff;
        expect(prefix).toBe(endsOnHighSurrogate ? longest - 1 : longest);
      }),
    );
  });
});

describe("changedLength properties", () => {
  it("counts the code units of both spans outside their common ends, which is never negative", () => {
    fc.assert(
      fc.property(fc.oneof(textsAndSpan, similarTextsAndSpan), ([oldText, newText, span]) => {
        const { prefix, suffix } = commonEnds(oldText, newText, span);
        const changed = changedLength(oldText, newText, span);
        expect(changed).toBe(
          span.oldTo - span.oldFrom - prefix - suffix + (span.newTo - span.newFrom - prefix - suffix),
        );
        expect(changed).toBeGreaterThanOrEqual(0);
        if (oldText === newText) {
          expect(
            changedLength(oldText, newText, {
              oldFrom: 0,
              oldTo: oldText.length,
              newFrom: 0,
              newTo: newText.length,
            }),
          ).toBe(0);
        }
      }),
    );
  });
});
