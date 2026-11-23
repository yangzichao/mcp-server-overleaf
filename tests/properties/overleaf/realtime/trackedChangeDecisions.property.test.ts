import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { DocumentOperation } from "../../../../src/overleaf/realtime/overleafRealtimeSession.js";
import { buildRejectionOperations } from "../../../../src/overleaf/realtime/trackedChangeDecisions.js";
import type { TrackedChange } from "../../../../src/overleaf/realtime/trackedChangeRanges.js";

type DocumentSegment =
  | { readonly kind: "plain"; readonly text: string }
  | { readonly kind: "insertion"; readonly text: string }
  | { readonly kind: "deletion"; readonly text: string };

const segmentText = fc.oneof(
  fc.constantFrom("a", "word ", "\n", "\\cite{x}", "北京", "𝔸", "$x$"),
  fc.string({ minLength: 1, maxLength: 5 }),
);
const segment: fc.Arbitrary<DocumentSegment> = fc.record({
  kind: fc.constantFrom("plain" as const, "insertion" as const, "deletion" as const),
  text: segmentText,
});

/** Overleaf merges neighbouring deletions into one range, so two never sit at the same position. */
const reviewedDocument = fc
  .array(segment, { maxLength: 10 })
  .filter((segments) =>
    segments.every(
      (current, index) => !(current.kind === "deletion" && segments[index + 1]?.kind === "deletion"),
    ),
  );

interface ReviewedDocument {
  readonly currentText: string;
  readonly rejectedText: string;
  readonly changes: TrackedChange[];
}

function layOut(segments: readonly DocumentSegment[]): ReviewedDocument {
  let currentText = "";
  let rejectedText = "";
  const changes: TrackedChange[] = [];
  segments.forEach((piece, index) => {
    if (piece.kind !== "plain") {
      changes.push({
        changeId: `change-${index}`,
        kind: piece.kind,
        text: piece.text,
        position: currentText.length,
        authorId: undefined,
        madeAt: undefined,
      });
    }
    if (piece.kind !== "deletion") currentText += piece.text;
    if (piece.kind !== "insertion") rejectedText += piece.text;
  });
  return { currentText, rejectedText, changes };
}

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

describe("buildRejectionOperations properties", () => {
  it("turns the document back into its text without any of the suggestions, in whatever order they are listed", () => {
    fc.assert(
      fc.property(
        reviewedDocument.chain((segments) => {
          const document = layOut(segments);
          return fc.tuple(
            fc.constant(document),
            fc.shuffledSubarray(document.changes, { minLength: document.changes.length }),
          );
        }),
        ([document, shuffledChanges]) => {
          const operations = buildRejectionOperations(document.currentText.split("\n"), shuffledChanges);
          expect(applyInOrder(document.currentText, operations)).toBe(document.rejectedText);
        },
      ),
    );
  });

  it("marks every operation as an undo, so it is not tracked as a new suggestion", () => {
    fc.assert(
      fc.property(reviewedDocument, (segments) => {
        const document = layOut(segments);
        for (const operation of buildRejectionOperations(
          document.currentText.split("\n"),
          document.changes,
        )) {
          expect(operation).toHaveProperty("u", true);
        }
      }),
    );
  });

  it("refuses an insertion whose text is no longer at its position", () => {
    fc.assert(
      fc.property(reviewedDocument, fc.string({ minLength: 1, maxLength: 4 }), (segments, staleText) => {
        const document = layOut(segments);
        const insertion = document.changes.find((change) => change.kind === "insertion");
        fc.pre(insertion !== undefined);
        const moved = { ...insertion!, text: `${insertion!.text}${staleText}` };
        fc.pre(document.currentText.slice(moved.position, moved.position + moved.text.length) !== moved.text);
        expect(() => buildRejectionOperations(document.currentText.split("\n"), [moved])).toThrow(
          /no longer matches/,
        );
      }),
    );
  });
});
