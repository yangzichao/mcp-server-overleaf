import { describe, expect, it } from "vitest";

import { buildRejectionOperations } from "../../../src/overleaf/realtime/trackedChangeDecisions.js";
import type { TrackedChange } from "../../../src/overleaf/realtime/trackedChangeRanges.js";

function change(
  changeId: string,
  kind: TrackedChange["kind"],
  position: number,
  text: string,
): TrackedChange {
  return { changeId, kind, position, text, authorId: undefined, madeAt: undefined };
}

describe("building the edits that reject suggestions", () => {
  const lines = ["Hello, brave new world.", "Second line."];

  it("deletes a suggested insertion and re-inserts a suggested deletion, both flagged as undo", () => {
    const operations = buildRejectionOperations(lines, [
      change("ins", "insertion", 7, "brave "),
      change("del", "deletion", 30, "old "),
    ]);
    expect(operations).toEqual([
      { p: 30, i: "old ", u: true },
      { p: 7, d: "brave ", u: true },
    ]);
  });

  it("works from the end of the document backwards, so earlier positions stay valid", () => {
    const operations = buildRejectionOperations(lines, [
      change("first", "insertion", 0, "Hello"),
      change("last", "insertion", 24, "Second"),
      change("middle", "insertion", 7, "brave"),
    ]);
    expect(operations.map((operation) => operation.p)).toEqual([24, 7, 0]);
  });

  it("undoes the insertion before the deletion when a replacement shares one position", () => {
    const operations = buildRejectionOperations(lines, [
      change("del", "deletion", 7, "bold "),
      change("ins", "insertion", 7, "brave "),
    ]);
    expect(operations).toEqual([
      { p: 7, d: "brave ", u: true },
      { p: 7, i: "bold ", u: true },
    ]);
  });

  it("refuses an insertion whose text is no longer where the range says", () => {
    expect(() => buildRejectionOperations(lines, [change("stale", "insertion", 0, "Goodbye")])).toThrow(
      /stale no longer matches the document/,
    );
  });
});
