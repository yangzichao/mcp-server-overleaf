import { describe, expect, it } from "vitest";

import { MAXIMUM_LINE_EDIT_DISTANCE } from "../../../../src/overleaf/realtime/textChanges/changedLineRanges.js";
import { buildTextChangeOperations } from "../../../../src/overleaf/realtime/textChanges/textChangeOperations.js";
import { applyOperationsInOrder } from "./applyOperationsInOrder.js";

function expectRoundTrip(oldText: string, newText: string) {
  const operations = buildTextChangeOperations(oldText, newText);
  expect(applyOperationsInOrder(oldText, operations)).toBe(newText);
  for (const operation of operations) expect("d" in operation ? operation.d : operation.i).not.toBe("");
  return operations;
}

/** mulberry32: a small seeded generator, so a failing case can be replayed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

const RANDOM_LINES = ["\\item x", "", "  % note", "a", "b", "\u00e9", "\u{1F600}", "\\end{x}", "c c"];

function randomLine(random: Random): string {
  return RANDOM_LINES[Math.floor(random() * RANDOM_LINES.length)] ?? "";
}

/** Up to four inserted, deleted or lengthened lines, at random places. */
function editRandomly(lines: readonly string[], random: Random): string[] {
  const edited = [...lines];
  for (let edit = Math.floor(random() * 5); edit > 0; edit -= 1) {
    const position = Math.floor(random() * (edited.length + 1));
    const choice = random();
    if (choice < 0.4) edited.splice(position, 0, randomLine(random));
    else if (choice < 0.7) edited.splice(position, 1);
    else edited[position] = `${edited[position] ?? ""}${randomLine(random)}`;
  }
  return edited;
}

function joinLines(lines: readonly string[], lineEnd: string, finalNewline: string): string {
  return lines.join(lineEnd) + (lines.length > 0 ? finalNewline : "");
}

describe("buildTextChangeOperations", () => {
  it("gives nothing for identical texts", () => {
    expect(buildTextChangeOperations("same\ntext\n", "same\ntext\n")).toEqual([]);
    expect(buildTextChangeOperations("", "")).toEqual([]);
  });

  it("inserts everything into an empty document and deletes everything to empty one", () => {
    expect(expectRoundTrip("", "\\section{Intro}\nHello.\n")).toEqual([
      { p: 0, i: "\\section{Intro}\nHello.\n" },
    ]);
    expect(expectRoundTrip("\\section{Intro}\nHello.\n", "")).toEqual([
      { p: 0, d: "\\section{Intro}\nHello.\n" },
    ]);
  });

  it("changes only the characters that differ inside a changed line", () => {
    expect(expectRoundTrip("The cat sat.\nOn the mat.\n", "The dog sat.\nOn the mat.\n")).toEqual([
      { p: 4, d: "cat" },
      { p: 4, i: "dog" },
    ]);
  });

  it("emits several changes from the end backwards so each position is still valid", () => {
    const oldText = "alpha\nbeta\ngamma\ndelta\nepsilon\n";
    const newText = "alpha\nBETA\ngamma\ndelta\nepsilon\nzeta\n";
    expect(expectRoundTrip(oldText, newText)).toEqual([
      { p: 31, i: "zeta\n" },
      { p: 6, d: "beta" },
      { p: 6, i: "BETA" },
    ]);
  });

  it("handles a change on the very first and the very last character", () => {
    expect(expectRoundTrip("abc\nmiddle\nxyz", "Abc\nmiddle\nxyZ")).toEqual([
      { p: 13, d: "z" },
      { p: 13, i: "Z" },
      { p: 0, d: "a" },
      { p: 0, i: "A" },
    ]);
  });

  it("keeps a CRLF file's line ends and touches only the changed text", () => {
    expect(expectRoundTrip("a\r\nb\r\nc\r\n", "a\r\nB\r\nc\r\n")).toEqual([
      { p: 3, d: "b" },
      { p: 3, i: "B" },
    ]);
    expectRoundTrip("one\r\ntwo\r\n", "one\ntwo\n");
    expectRoundTrip("no final newline\r\n", "no final newline");
  });

  it("counts positions in UTF-16 code units and never splits a surrogate pair", () => {
    // "café 论文" then "naïve" with precomposed accents: one code unit each.
    expect(expectRoundTrip("café 论文\nnaïve\n", "café 论文\nnaive\n")).toEqual([
      { p: 10, d: "ï" },
      { p: 10, i: "i" },
    ]);
    // U+1F600 and U+1F601 share their high surrogate; the pair must move as a whole.
    expect(expectRoundTrip("x\u{1F600}y", "x\u{1F601}y")).toEqual([
      { p: 1, d: "\u{1F600}" },
      { p: 1, i: "\u{1F601}" },
    ]);
    expect(expectRoundTrip("\u{1F600}a", "\u{1F680}a")).toEqual([
      { p: 0, d: "\u{1F600}" },
      { p: 0, i: "\u{1F680}" },
    ]);
  });

  it("inserts and deletes whole lines between unchanged ones", () => {
    expect(expectRoundTrip("a\nc\n", "a\nb\nc\n")).toEqual([{ p: 2, i: "b\n" }]);
    expect(expectRoundTrip("a\nb\nc\n", "a\nc\n")).toEqual([{ p: 2, d: "b\n" }]);
  });

  it("keeps an edit that joins lines beside a copy of the new line one small change", () => {
    expect(expectRoundTrip("b\n\\item x\r\n\\item x\n", "b\n\\item x\nitem x\n")).toEqual([
      { p: 9, d: "\r\n\\" },
      { p: 9, i: "\n" },
    ]);
    expect(expectRoundTrip("\\item y\n\\item x\n", "\\item x\nitem x\n")).toEqual([
      { p: 6, d: "y\n\\" },
      { p: 6, i: "x\n" },
    ]);
  });

  it("keeps that join one small change when the edit also changes another place", () => {
    const unchanged = "unchanged one\nunchanged two\nunchanged three\n";
    expect(
      expectRoundTrip(
        `b\n\\item x\r\n\\item x\n${unchanged}The cat sat.\n`,
        `b\n\\item x\nitem x\n${unchanged}The dog sat.\n`,
      ),
    ).toEqual([
      { p: 67, d: "cat" },
      { p: 67, i: "dog" },
      { p: 9, d: "\r\n\\" },
      { p: 9, i: "\n" },
    ]);
  });

  it("falls back to one change when too many lines differ to search for the smallest", () => {
    const lineCount = MAXIMUM_LINE_EDIT_DISTANCE;
    const oldText = Array.from({ length: lineCount }, (_, index) => `old line ${index}\n`).join("");
    const newText = Array.from({ length: lineCount }, (_, index) => `new row ${index}\n`).join("");
    const operations = expectRoundTrip(
      `same start\n${oldText}same end\n`,
      `same start\n${newText}same end\n`,
    );
    expect(operations).toHaveLength(2);
  });

  it("turns random edits of random documents into operations that reproduce the new text", () => {
    const random = seededRandom(20261122);
    for (let trial = 0; trial < 300; trial += 1) {
      const oldLines = Array.from({ length: Math.floor(random() * 12) }, () => randomLine(random));
      const newLines = editRandomly(oldLines, random);
      const lineEnd = random() < 0.5 ? "\n" : "\r\n";
      const finalNewline = random() < 0.5 ? lineEnd : "";
      expectRoundTrip(joinLines(oldLines, lineEnd, finalNewline), joinLines(newLines, lineEnd, finalNewline));
    }
  });
});
