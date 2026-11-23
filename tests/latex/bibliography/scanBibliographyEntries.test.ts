import { describe, expect, it } from "vitest";

import { scanBibliographyEntries } from "../../../src/latex/bibliography/scanBibliographyEntries.js";

/**
 * Each input below was run through BibTeX 0.99d (TeX Live 2025) with `\citation{*}`, which
 * defined the same keys and reported an error in each entry given null fields here. BibTeX also
 * expands a macro name such as jan, which these readers leave as written.
 */

function keysAndFields(bibliographySource: string) {
  return scanBibliographyEntries("refs.bib", bibliographySource).map((entry) => [
    entry.key,
    entry.fields === null ? null : Object.fromEntries(entry.fields),
  ]);
}

describe("scanBibliographyEntries", () => {
  it("starts no entry at an @ inside a braced or quoted field value", () => {
    expect(
      keysAndFields(
        [
          "@article{a, note = {see @misc{b, title = {B}}}}",
          '@article{c, note = "see @misc{d, title = {D}}"}',
          "@string{acl = {Assoc @misc{s, title = {S}}}}",
          '@preamble{"@misc{p, title = {P}}"}',
        ].join("\n"),
      ),
    ).toEqual([
      ["a", { note: "see @misc{b, title = {B}}" }],
      ["c", { note: "see @misc{d, title = {D}}" }],
    ]);
  });

  it("lets a backslash escape no brace, so a braced value ends at the first brace that closes it", () => {
    expect(
      keysAndFields("@article{a, title = {50\\% \\} off}, note = {N}}\n@book{c, title = {C}}\n"),
    ).toEqual([
      ["a", null],
      ["c", { title: "C" }],
    ]);
  });

  it("ends a quoted value at a quote outside braces, and rejects a } there", () => {
    expect(
      keysAndFields('@misc{q, title = "a {"} b"}\n@misc{r, title = "x}y @book{j, title={J}}"}\n'),
    ).toEqual([
      ["q", { title: 'a {"} b' }],
      ["r", null],
      ["j", { title: "J" }],
    ]);
  });

  it("goes on from the character it rejects, so an unclosed value swallows the rest of the file", () => {
    expect(keysAndFields("@misc{g, title = {A} junk @book{h, title={H}}}\n")).toEqual([
      ["g", null],
      ["h", { title: "H" }],
    ]);
    expect(keysAndFields("@article{a, title = {unclosed\n@book{b, title = {B}}\n")).toEqual([["a", null]]);
  });

  it("reads past @comment's name only, and past @string and @preamble bodies", () => {
    expect(
      keysAndFields(
        '@comment{a {nested} b @article{x, title={X}}}\n@string(foo = "bar")\n@preamble{{x} # "y"}\n@misc{after, title = {After}}\n',
      ),
    ).toEqual([
      ["x", { title: "X" }],
      ["after", { title: "After" }],
    ]);
  });

  it("reads an entry with no fields, a trailing comma, and a key with anything but a comma or white space", () => {
    expect(
      keysAndFields(
        "@misc{key}\n@misc{key2,}\n@misc{a=b#c\"d(e'f@g , title = {Odd}}\n@misc(paren, title = {a)b})\n",
      ),
    ).toEqual([
      ["key", {}],
      ["key2", {}],
      ["a=b#c\"d(e'f@g", { title: "Odd" }],
      ["paren", { title: "a)b" }],
    ]);
  });

  it("rejects two commas, a missing comma, a name starting with a digit, and a number run into letters", () => {
    expect(
      keysAndFields(
        [
          "@misc{twocommas, title = {A},, note = {B}}",
          "@misc{nocommabetween, title = {A} note = {B}}",
          "@misc{digitname, 1title = {x}}",
          "@misc{num, title = 20a17}",
          '@misc{concat, title = {A} # "B" # 12 # jan}',
        ].join("\n"),
      ),
    ).toEqual([
      ["twocommas", null],
      ["nocommabetween", null],
      ["digitname", null],
      ["num", null],
      ["concat", { title: "AB12jan" }],
    ]);
  });

  it("reads any entry type BibTeX takes for a name, and skips an @ that starts nothing", () => {
    const entries = scanBibliographyEntries(
      "refs.bib",
      "@My-Type{hy, title={H}}\n@ article {sp, title={S}}\nemail me@example.com\n@misc{c, title={C}}\n",
    );
    expect(entries.map((entry) => [entry.entryType, entry.key, entry.location.line])).toEqual([
      ["my-type", "hy", 1],
      ["article", "sp", 2],
      ["misc", "c", 4],
    ]);
  });
});
