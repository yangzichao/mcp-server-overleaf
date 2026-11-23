import { describe, expect, it } from "vitest";

import {
  BIBER_READING_RULES,
  BIBTEX_READING_RULES,
  UNKNOWN_PROGRAM_READING_RULES,
} from "../../../src/latex/bibliography/bibliographyReadingRules.js";
import { scanBibliographyFiles } from "../../../src/latex/bibliography/scanBibliographyFiles.js";
import { keysAndFields, keysRead } from "../support/scannedBibliography.js";

const TWO_ENTRIES_ON_THE_LAST_LINE = "@misc{a, title = {A}}\n@misc{b, title = {B}} @misc{c, title = {C}}";

describe("the last line of a .bib file", () => {
  it("ends BibTeX's reading once an entry ends on it, with or without a line break after it", () => {
    expect(keysRead(TWO_ENTRIES_ON_THE_LAST_LINE)).toEqual(["a", "b"]);
    expect(keysRead(`${TWO_ENTRIES_ON_THE_LAST_LINE}\n`)).toEqual(["a", "b"]);
  });

  it("is no longer the last line once another follows, even an empty one or one of spaces", () => {
    expect(keysRead(`${TWO_ENTRIES_ON_THE_LAST_LINE}\n\n`)).toEqual(["a", "b", "c"]);
    expect(keysRead(`${TWO_ENTRIES_ON_THE_LAST_LINE}\n  `)).toEqual(["a", "b", "c"]);
  });

  it("ends at a carriage return as at a line feed, so a file ending in CRLF ends with an empty line", () => {
    expect(keysRead("@misc{a}\r\n@misc{b} @misc{c}\r\n")).toEqual(["a", "b", "c"]);
    expect(keysRead("@misc{a}\r\n@misc{b} @misc{c}")).toEqual(["a", "b"]);
    expect(keysRead("@misc{a}\r@misc{b} @misc{c}\r")).toEqual(["a", "b"]);
    expect(keysRead("@misc{a}\r@misc{b} @misc{c}\r\r")).toEqual(["a", "b", "c"]);
  });

  it("ends BibTeX's reading after a command, a stray @ or an error that ends on it", () => {
    expect(keysRead('@string{x = "X"} @misc{s, title = x}')).toEqual([]);
    expect(keysRead('@preamble{"P"} @misc{p}')).toEqual([]);
    expect(keysRead("@comment{C} @misc{c}")).toEqual([]);
    expect(keysRead("email foo@bar.com @misc{m}")).toEqual([]);
    expect(keysAndFields("@misc{e title = {E}} @misc{f}")).toEqual([["e", {}, "cut short by an error"]]);
  });

  it("ends BibTeX's reading where an error finds the next line to be the last", () => {
    expect(keysRead("email me@example.com\n@misc{c, title={C}}\n")).toEqual([]);
    expect(keysRead("email me@example.com\n@misc{c, title={C}}\n\n")).toEqual(["c"]);
  });

  it("drops what follows an entry that ends on it, wherever the entry starts", () => {
    expect(keysRead("@misc{long,\n  title = {L}} @misc{after}")).toEqual(["long"]);
  });

  it("applies to each file BibTeX reads", () => {
    const files = [
      { path: "one.bib", text: "@misc{first}\n@misc{lastofone} @misc{droppedfromone}\n" },
      { path: "two.bib", text: "@misc{second}\n" },
    ];
    expect(scanBibliographyFiles(files, BIBTEX_READING_RULES).map((entry) => entry.key)).toEqual([
      "first",
      "lastofone",
      "second",
    ]);
  });

  it("is read on by biber, and when the program is unknown", () => {
    expect(keysRead(TWO_ENTRIES_ON_THE_LAST_LINE, BIBER_READING_RULES)).toEqual(["a", "b", "c"]);
    expect(keysRead(TWO_ENTRIES_ON_THE_LAST_LINE, UNKNOWN_PROGRAM_READING_RULES)).toEqual(["a", "b", "c"]);
  });
});
