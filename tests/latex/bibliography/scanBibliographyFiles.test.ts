import { describe, expect, it } from "vitest";

import { BIBTEX_READING_RULES } from "../../../src/latex/bibliography/bibliographyReadingRules.js";
import { scanBibliographyFiles } from "../../../src/latex/bibliography/scanBibliographyFiles.js";
import { keysAndFields } from "../support/scannedBibliography.js";

/** Each case ends with an empty line, so BibTeX's last-line rule stops none of them early. */
describe("scanBibliographyFiles", () => {
  it("starts no entry at an @ inside a braced or quoted field value", () => {
    expect(
      keysAndFields(
        [
          "@article{a, note = {see @misc{b, title = {B}}}}",
          '@article{c, note = "see @misc{d, title = {D}}"}',
          "@string{acl = {Assoc @misc{s, title = {S}}}}",
          '@preamble{"@misc{p, title = {P}}"}',
          "",
        ].join("\n"),
      ),
    ).toEqual([
      ["a", { note: "see @misc{b, title = {B}}" }],
      ["c", { note: "see @misc{d, title = {D}}" }],
    ]);
  });

  it("lets a backslash escape no brace, so a braced value ends at the first brace that closes it", () => {
    expect(
      keysAndFields("@article{a, title = {50\\% \\} off}, note = {N}}\n@book{c, title = {C}}\n\n"),
    ).toEqual([
      ["a", { title: "50\\% \\" }, "cut short by an error"],
      ["c", { title: "C" }],
    ]);
  });

  it("ends a quoted value at a quote outside braces, and rejects a } there", () => {
    expect(
      keysAndFields('@misc{q, title = "a {"} b"}\n@misc{r, title = "x}y @book{j, title={J}}"}\n\n'),
    ).toEqual([
      ["q", { title: 'a {"} b' }],
      ["r", {}, "cut short by an error"],
      ["j", { title: "J" }],
    ]);
  });

  it("goes on from the character it rejects, so an unclosed value swallows the rest of the file", () => {
    expect(keysAndFields("@misc{g, title = {A} junk @book{h, title={H}}}\n\n")).toEqual([
      ["g", { title: "A" }, "cut short by an error"],
      ["h", { title: "H" }],
    ]);
    expect(keysAndFields("@article{a, title = {unclosed\n@book{b, title = {B}}\n\n")).toEqual([
      ["a", {}, "cut short by an error"],
    ]);
  });

  it("reads past @comment's name only, and past @string and @preamble bodies", () => {
    expect(
      keysAndFields(
        '@comment{a {nested} b @article{x, title={X}}}\n@string(foo = "bar")\n@preamble{{x} # "y"}\n@misc{after, title = {After}}\n\n',
      ),
    ).toEqual([
      ["x", { title: "X" }],
      ["after", { title: "After" }],
    ]);
  });

  it("reads an entry with no fields, a trailing comma, and a key with anything but a comma or white space", () => {
    expect(
      keysAndFields(
        "@misc{key}\n@misc{key2,}\n@misc{a=b#c\"d(e'f@g , title = {Odd}}\n@misc(paren, title = {a)b})\n\n",
      ),
    ).toEqual([
      ["key", {}],
      ["key2", {}],
      ["a=b#c\"d(e'f@g", { title: "Odd" }],
      ["paren", { title: "a)b" }],
    ]);
  });

  it("keeps the fields read before two commas, a missing comma, a name starting with a digit, or a number run into letters", () => {
    expect(
      keysAndFields(
        [
          "@misc{nocommaafterthekey title = {A}}",
          "@misc{twocommas, title = {A},, note = {B}}",
          "@misc{nocommabetween, title = {A} note = {B}}",
          "@misc{digitname, 1title = {x}}",
          "@misc{num, title = 20a17}",
          "",
        ].join("\n"),
      ),
    ).toEqual([
      ["nocommaafterthekey", {}, "cut short by an error"],
      ["twocommas", { title: "A" }, "cut short by an error"],
      ["nocommabetween", { title: "A" }, "cut short by an error"],
      ["digitname", {}, "cut short by an error"],
      ["num", { title: "20" }, "cut short by an error"],
    ]);
  });

  it("keeps the first of a repeated field, whatever the case of its name", () => {
    expect(keysAndFields("@misc{a, title = {A}, title = {B}, Title = {C}}\n\n")).toEqual([
      ["a", { title: "A" }],
    ]);
  });

  it("reads any entry type BibTeX takes for a name, and skips an @ that starts nothing", () => {
    const entries = scanBibliographyFiles(
      [
        {
          path: "refs.bib",
          text: "@My-Type{hy, title={H}}\n@ article {sp, title={S}}\nemail me@example.com\n@misc{c, title={C}}\n\n",
        },
      ],
      BIBTEX_READING_RULES,
    );
    expect(entries.map((entry) => [entry.entryTypeInLowerCase, entry.key, entry.location])).toEqual([
      ["my-type", "hy", { path: "refs.bib", line: 1 }],
      ["article", "sp", { path: "refs.bib", line: 2 }],
      ["misc", "c", { path: "refs.bib", line: 4 }],
    ]);
  });
});
