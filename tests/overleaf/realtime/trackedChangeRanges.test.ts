import { describe, expect, it } from "vitest";

import {
  describeLineForPosition,
  readDocumentRanges,
} from "../../../src/overleaf/realtime/trackedChangeRanges.js";

/**
 * The `ranges` payload is the one part of this server's input that no test fixture can
 * vouch for. The Git bridge has a contract; Overleaf's editor does not publish one, and
 * the fake remote in tests/integration only ever produces the shapes this repository
 * decided to write. So the defensive half of the reader — every branch that drops a
 * malformed entry rather than surfacing it as a broken suggestion — is exercised here
 * against payloads the fake would never send.
 */

const insertion = {
  id: "c1",
  op: { p: 12, i: "new text" },
  metadata: { user_id: "u1", ts: 1_700_000_000_000 },
};
const deletion = { id: "c2", op: { p: 4, d: "old text" }, metadata: { user_id: "u2" } };
const comment = { id: "m1", op: { p: 7, c: "quoted", t: "t1" } };

describe("reading a well-formed payload", () => {
  it("separates an insertion from a deletion and keeps what each one says", () => {
    const { changes } = readDocumentRanges({ changes: [insertion, deletion] });
    expect(changes).toEqual([
      { changeId: "c2", kind: "deletion", text: "old text", position: 4, authorId: "u2", madeAt: undefined },
      {
        changeId: "c1",
        kind: "insertion",
        text: "new text",
        position: 12,
        authorId: "u1",
        madeAt: "2023-11-14T22:13:20.000Z",
      },
    ]);
  });

  it("orders changes and comments by position, not by the order Overleaf listed them", () => {
    const later = { id: "c3", op: { p: 99, i: "z" } };
    const { changes } = readDocumentRanges({ changes: [later, insertion, deletion] });
    expect(changes.map((change) => change.position)).toEqual([4, 12, 99]);
  });

  it("reads a comment anchor with its thread and quoted passage", () => {
    const { comments } = readDocumentRanges({ comments: [comment] });
    expect(comments).toEqual([{ commentId: "m1", threadId: "t1", quotedText: "quoted", position: 7 }]);
  });
});

describe("a payload that is not what the reader expected", () => {
  // A document with nothing to review comes back as `{}`, not as empty arrays.
  it("treats an empty object as a document with nothing to review", () => {
    expect(readDocumentRanges({})).toEqual({ changes: [], comments: [] });
  });

  it.each([
    ["null", null],
    ["a string", "changes"],
    ["a number", 7],
  ])("returns empty ranges for %s rather than throwing", (_label, payload) => {
    expect(readDocumentRanges(payload)).toEqual({ changes: [], comments: [] });
  });

  it("ignores changes and comments that are not arrays", () => {
    expect(readDocumentRanges({ changes: { id: "c1" }, comments: "none" })).toEqual({
      changes: [],
      comments: [],
    });
  });

  it.each([
    ["no id", { op: { p: 1, i: "x" } }],
    ["no op", { id: "c1" }],
    ["an op that is not an object", { id: "c1", op: "insert" }],
    ["neither an insertion nor a deletion", { id: "c1", op: { p: 1 } }],
    ["a non-string insertion", { id: "c1", op: { p: 1, i: 42 } }],
    ["an entry that is not an object", "c1"],
    ["null", null],
  ])("drops a change with %s instead of reporting a broken suggestion", (_label, entry) => {
    expect(readDocumentRanges({ changes: [entry] }).changes).toEqual([]);
  });

  it("keeps the good changes in a list that also holds bad ones", () => {
    const { changes } = readDocumentRanges({ changes: [{ id: "bad" }, insertion] });
    expect(changes.map((change) => change.changeId)).toEqual(["c1"]);
  });

  it.each([
    ["no thread id", { id: "m1", op: { p: 1, c: "x" } }],
    ["no op", { id: "m1" }],
    ["a non-string thread id", { id: "m1", op: { p: 1, c: "x", t: 5 } }],
  ])("drops a comment with %s", (_label, entry) => {
    expect(readDocumentRanges({ comments: [entry] }).comments).toEqual([]);
  });

  it("falls back to the thread id when a comment carries no id of its own", () => {
    const { comments } = readDocumentRanges({ comments: [{ op: { p: 1, c: "x", t: "t9" } }] });
    expect(comments[0]).toMatchObject({ commentId: "t9", threadId: "t9" });
  });

  it("defaults a missing or non-numeric position to the start of the document", () => {
    expect(readDocumentRanges({ changes: [{ id: "c1", op: { i: "x" } }] }).changes[0]?.position).toBe(0);
    expect(
      readDocumentRanges({ changes: [{ id: "c1", op: { p: "12", i: "x" } }] }).changes[0]?.position,
    ).toBe(0);
    expect(readDocumentRanges({ comments: [{ op: { c: "x", t: "t1" } }] }).comments[0]?.position).toBe(0);
  });

  it("reads a comment with no quoted text as an empty anchor rather than dropping it", () => {
    const { comments } = readDocumentRanges({ comments: [{ id: "m1", op: { p: 3, t: "t1" } }] });
    expect(comments[0]?.quotedText).toBe("");
  });
});

describe("timestamps, which Overleaf has sent as both a number and a string", () => {
  it("reads epoch milliseconds", () => {
    const { changes } = readDocumentRanges({
      changes: [{ id: "c1", op: { p: 0, i: "x" }, metadata: { ts: 1_700_000_000_000 } }],
    });
    expect(changes[0]?.madeAt).toBe("2023-11-14T22:13:20.000Z");
  });

  it("normalises a parseable date string", () => {
    const { changes } = readDocumentRanges({
      changes: [{ id: "c1", op: { p: 0, i: "x" }, metadata: { ts: "2023-11-14T22:13:20.000Z" } }],
    });
    expect(changes[0]?.madeAt).toBe("2023-11-14T22:13:20.000Z");
  });

  // Passing it through beats inventing a date, and beats dropping the whole change.
  it("keeps an unparseable string as it arrived", () => {
    const { changes } = readDocumentRanges({
      changes: [{ id: "c1", op: { p: 0, i: "x" }, metadata: { ts: "some time last week" } }],
    });
    expect(changes[0]?.madeAt).toBe("some time last week");
  });

  it("leaves a missing or non-scalar timestamp undefined", () => {
    const { changes } = readDocumentRanges({
      changes: [
        { id: "c1", op: { p: 0, i: "x" } },
        { id: "c2", op: { p: 1, i: "y" }, metadata: { ts: { when: "now" } } },
      ],
    });
    expect(changes.map((change) => change.madeAt)).toEqual([undefined, undefined]);
  });

  it("survives metadata that is not an object", () => {
    const { changes } = readDocumentRanges({ changes: [{ id: "c1", op: { p: 0, i: "x" }, metadata: 5 }] });
    expect(changes[0]).toMatchObject({ changeId: "c1", authorId: undefined, madeAt: undefined });
  });
});

/**
 * Overleaf counts one character offset across the whole document joined by newlines, so
 * the separator has to be counted too. Off by one here misreports which line a co-author's
 * suggestion sits on.
 */
describe("turning a character offset into a line number", () => {
  const lines = ["alpha", "beta", "gamma"];

  it.each([
    [0, 1],
    [4, 1],
    [5, 1],
    [6, 2],
    [10, 2],
    [11, 3],
    [16, 3],
  ])("puts offset %i on line %i, counting the newline as part of the line it ends", (offset, line) => {
    expect(describeLineForPosition(lines, offset)).toBe(line);
  });

  it("clamps an offset past the end to the last line rather than returning nothing", () => {
    expect(describeLineForPosition(lines, 9_999)).toBe(3);
  });

  it("returns 0 for a document with no lines at all", () => {
    expect(describeLineForPosition([], 0)).toBe(0);
  });

  it("counts an empty line, which still occupies its newline", () => {
    expect(describeLineForPosition(["", "second"], 0)).toBe(1);
    expect(describeLineForPosition(["", "second"], 1)).toBe(2);
  });
});
