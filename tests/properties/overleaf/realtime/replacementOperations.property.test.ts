import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { replaceTextOccurrences } from "../../../../src/latex/replaceTextOccurrences.js";
import type { DocumentOperation } from "../../../../src/overleaf/realtime/overleafRealtimeSession.js";
import { buildReplacementOperations } from "../../../../src/overleaf/realtime/replacementOperations.js";
import { latexFragment, latexTextWithLineBreaksAnywhere } from "../../support/latexArbitraries.js";

function applyInOrder(text: string, operations: readonly DocumentOperation[]): string {
  let current = text;
  for (const operation of operations) {
    if ("d" in operation) {
      expect(current.slice(operation.p, operation.p + operation.d.length)).toBe(operation.d);
      current = current.slice(0, operation.p) + current.slice(operation.p + operation.d.length);
    } else if ("i" in operation) {
      current = current.slice(0, operation.p) + operation.i + current.slice(operation.p);
    }
  }
  return current;
}

const replaceArguments = latexTextWithLineBreaksAnywhere.chain((text) =>
  fc.record({
    text: fc.constant(text),
    findText: fc
      .oneof(
        fc
          .tuple(fc.nat(text.length), fc.integer({ min: 1, max: 5 }))
          .map(([start, length]) => text.slice(start, start + length)),
        latexFragment,
      )
      .filter((findText) => findText !== ""),
    replaceWith: fc.oneof(latexTextWithLineBreaksAnywhere, fc.constant("")),
    replaceAll: fc.boolean(),
  }),
);

describe("buildReplacementOperations properties", () => {
  it("produces operations that, applied in order, give the same text replace_text gives over Git", () => {
    fc.assert(
      fc.property(replaceArguments, ({ text, findText, replaceWith, replaceAll }) => {
        const overGit = replaceTextOccurrences(text, findText, replaceWith, replaceAll);
        const overEditor = buildReplacementOperations(text, findText, replaceWith, replaceAll);
        if (overGit.status !== "replaced" || overEditor.status !== "replaced") {
          expect(overEditor).toEqual(overGit);
          return;
        }
        expect(overEditor.occurrenceCount).toBe(overGit.occurrenceCount);
        expect(applyInOrder(text, overEditor.operations)).toBe(overGit.updatedContent);
      }),
    );
  });

  it("never sends an empty insertion", () => {
    fc.assert(
      fc.property(replaceArguments, ({ text, findText, replaceWith, replaceAll }) => {
        const result = buildReplacementOperations(text, findText, replaceWith, replaceAll);
        if (result.status !== "replaced") return;
        for (const operation of result.operations) {
          if ("i" in operation) expect(operation.i).not.toBe("");
        }
      }),
    );
  });

  it("refuses an empty findText for any text", () => {
    fc.assert(
      fc.property(
        latexTextWithLineBreaksAnywhere,
        latexTextWithLineBreaksAnywhere,
        fc.boolean(),
        (text, replaceWith, replaceAll) => {
          expect(() => buildReplacementOperations(text, "", replaceWith, replaceAll)).toThrow(
            /findText is empty/,
          );
        },
      ),
    );
  });
});
