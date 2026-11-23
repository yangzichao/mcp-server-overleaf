import { describe, expect, it } from "vitest";

import {
  BIBER_READING_RULES,
  UNKNOWN_PROGRAM_READING_RULES,
} from "../../../src/latex/bibliography/bibliographyReadingRules.js";
import { keysAndFields } from "../support/scannedBibliography.js";

const COMMENTED_OUT_ENTRIES = [
  "@misc{before, title = {B}}",
  "% @misc{commented, title = {C}}",
  "  % @misc{indented, title = {I}}",
  "@misc{after, title = {A}}",
  "",
].join("\n");

describe("a line starting with %", () => {
  it("is text to BibTeX, so an entry written on it counts", () => {
    expect(keysAndFields(COMMENTED_OUT_ENTRIES)).toEqual([
      ["before", { title: "B" }],
      ["commented", { title: "C" }],
      ["indented", { title: "I" }],
      ["after", { title: "A" }],
    ]);
  });

  it("is skipped by biber", () => {
    expect(keysAndFields(COMMENTED_OUT_ENTRIES, BIBER_READING_RULES)).toEqual([
      ["before", { title: "B" }],
      ["after", { title: "A" }],
    ]);
  });

  it("counts when the program is unknown, so no key a program could read is missed", () => {
    expect(keysAndFields(COMMENTED_OUT_ENTRIES, UNKNOWN_PROGRAM_READING_RULES).map(([key]) => key)).toEqual([
      "before",
      "commented",
      "indented",
      "after",
    ]);
  });

  it("stops BibTeX reading an entry when it sits between two fields, and the fields before it stay", () => {
    const text =
      "@misc{fieldline,\n  title = {T},\n% note = {old},\n  note = {new}\n}\n@misc{after, title = {A}}\n";
    expect(keysAndFields(text)).toEqual([
      ["fieldline", { title: "T" }, "cut short by an error"],
      ["after", { title: "A" }],
    ]);
    expect(keysAndFields(text, BIBER_READING_RULES)).toEqual([
      ["fieldline", { title: "T", note: "new" }],
      ["after", { title: "A" }],
    ]);
  });

  it("is part of a braced value to BibTeX", () => {
    expect(keysAndFields("@misc{inside,\n  title = {First\n% second\nthird}\n}\n")).toEqual([
      ["inside", { title: "First\n% second\nthird" }],
    ]);
  });
});
