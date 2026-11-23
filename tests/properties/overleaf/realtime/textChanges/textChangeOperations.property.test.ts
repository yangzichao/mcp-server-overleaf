import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildTextChangeOperations } from "../../../../../src/overleaf/realtime/textChanges/textChangeOperations.js";
import { applyOperationsInOrder } from "../../../../overleaf/realtime/textChanges/applyOperationsInOrder.js";
import { asText, editedDocument, textWithSmallEdit } from "./editedDocuments.js";

const texts = editedDocument.map(({ oldLines, newLines, oldEndsWithLineEnd, newEndsWithLineEnd }) => ({
  oldText: asText(oldLines, oldEndsWithLineEnd),
  newText: asText(newLines, newEndsWithLineEnd),
}));

const editedTexts = fc.oneof(texts, textWithSmallEdit);

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

/** In a `u` pattern a class of surrogates matches only one that is not half of a pair. */
function hasLoneSurrogate(text: string): boolean {
  return /[\uD800-\uDFFF]/u.test(text);
}

function changedCodeUnits(oldText: string, newText: string): number {
  return buildTextChangeOperations(oldText, newText).reduce(
    (total, operation) => total + ("d" in operation ? operation.d.length : operation.i.length),
    0,
  );
}

/**
 * Ten lines no generated document holds. Any line diff that matched none of them would cost
 * more than two small edits can, so it keeps them all, and each edit's lines stay on its side.
 */
const SEPARATOR = Array.from({ length: 10 }, (_, index) => `%% separator ${index}\n`).join("");

describe("buildTextChangeOperations properties", () => {
  it("gives operations that, applied in order, turn the old text into the new one", () => {
    fc.assert(
      fc.property(editedTexts, ({ oldText, newText }) => {
        const operations = buildTextChangeOperations(oldText, newText);
        expect(applyOperationsInOrder(oldText, operations)).toBe(newText);
        expect(operations.length === 0).toBe(oldText === newText);
        for (const operation of operations) expect("d" in operation ? operation.d : operation.i).not.toBe("");
      }),
    );
  });

  it("runs from the end backwards, so each position and deletion is still where it was in the old text", () => {
    fc.assert(
      fc.property(editedTexts, ({ oldText, newText }) => {
        let earliestTouched = oldText.length;
        for (const operation of buildTextChangeOperations(oldText, newText)) {
          if ("d" in operation) {
            expect(oldText.slice(operation.p, operation.p + operation.d.length)).toBe(operation.d);
            expect(operation.p + operation.d.length).toBeLessThanOrEqual(earliestTouched);
          } else {
            expect(operation.p).toBeLessThanOrEqual(earliestTouched);
          }
          earliestTouched = operation.p;
        }
      }),
    );
  });

  it("never splits a surrogate pair", () => {
    fc.assert(
      fc.property(editedTexts, ({ oldText, newText }) => {
        for (const operation of buildTextChangeOperations(oldText, newText)) {
          expect(hasLoneSurrogate("d" in operation ? operation.d : operation.i)).toBe(false);
          expect(isLowSurrogate(oldText.charCodeAt(operation.p))).toBe(false);
        }
      }),
    );
  });

  // Found by this property: `\item x\r\n\item x\n` edited to `\item x\nitem x\n` once changed 16
  // code units where the edit changed 4, because the line diff kept the last line, which the
  // first had become, and rewrote both lines around it.
  it("changes no more code units than a small edit did", () => {
    fc.assert(
      fc.property(textWithSmallEdit, ({ oldText, newText, editedLength }) => {
        expect(changedCodeUnits(oldText, newText)).toBeLessThanOrEqual(editedLength);
      }),
    );
  });

  // Found by this property: é typed at the start of the first of two `\item x` lines changed 17
  // code units, not 1, once another edit sat further down. The line diff kept the first line as
  // the second and rewrote the lines on each side, and one change across the whole edit, which
  // had made up for that, now spanned both edits.
  it("changes no more code units than two small edits far apart did", () => {
    fc.assert(
      fc.property(textWithSmallEdit, textWithSmallEdit, (first, second) => {
        const oldText = `${first.oldText}\n${SEPARATOR}${second.oldText}`;
        const newText = `${first.newText}\n${SEPARATOR}${second.newText}`;
        expect(changedCodeUnits(oldText, newText)).toBeLessThanOrEqual(
          first.editedLength + second.editedLength,
        );
      }),
    );
  });
});
