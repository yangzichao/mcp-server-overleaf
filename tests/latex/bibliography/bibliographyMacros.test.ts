import { describe, expect, it } from "vitest";

import {
  BIBER_READING_RULES,
  BIBTEX_READING_RULES,
  UNKNOWN_PROGRAM_READING_RULES,
} from "../../../src/latex/bibliography/bibliographyReadingRules.js";
import { keysAndFields, keysAndFieldsOfFiles } from "../support/scannedBibliography.js";

describe("@string macros", () => {
  it("expand by name without regard to case, joined to the other parts of a value by #", () => {
    expect(keysAndFields('@STRING{Foo = "Foo"}\n@misc{a, title = fOo # " Bar" # {Baz} # 2020}\n\n')).toEqual([
      ["a", { title: "Foo BarBaz2020" }],
    ]);
  });

  it("are read in parentheses too, with names that hold - and .", () => {
    expect(
      keysAndFields(
        '@string(proc-acl = "ACL")\n@string{j.ml = {J{M}L}}\n@misc{a, title = proc-acl # j.ml}\n\n',
      ),
    ).toEqual([["a", { title: "ACLJ{M}L" }]]);
  });

  it("expand when they are defined, so a redefinition changes only the uses after it", () => {
    expect(
      keysAndFields(
        [
          '@string{a = "A"}',
          '@string{b = a # "B"}',
          "@misc{first, title = b, note = a}",
          '@string{a = "Z"}',
          "@misc{second, title = b, note = a}",
          "",
          "",
        ].join("\n"),
      ),
    ).toEqual([
      ["first", { title: "AB", note: "A" }],
      ["second", { title: "AB", note: "Z" }],
    ]);
  });

  it("expand to nothing before their definition, and when nothing defines them", () => {
    expect(
      keysAndFields(
        '@misc{early, title = foo # "x"}\n@string{foo = "Foo"}\n@misc{late, title = foo}\n@misc{none, title = nope # "y"}\n\n',
      ),
    ).toEqual([
      ["early", { title: "x" }],
      ["late", { title: "Foo" }],
      ["none", { title: "y" }],
    ]);
  });

  it("start with jan to dec as plain.bst names the months for BibTeX, and as 1 to 12 for biber", () => {
    const text = '@misc{m, title = jan # " " # DEC}\n\n';
    expect(keysAndFields(text, BIBTEX_READING_RULES)).toEqual([["m", { title: "January December" }]]);
    expect(keysAndFields(text, BIBER_READING_RULES)).toEqual([["m", { title: "1 12" }]]);
  });

  it("let a .bib file redefine a month", () => {
    expect(keysAndFields('@string{jan = "Jan."}\n@misc{m, title = jan}\n\n')).toEqual([
      ["m", { title: "Jan." }],
    ]);
  });

  it("keep a name nothing defines as written when the program is unknown, months included", () => {
    expect(
      keysAndFields(
        '@string{venue = "NeurIPS"}\n@misc{m, title = venue, month = June, year = jun}\n',
        UNKNOWN_PROGRAM_READING_RULES,
      ),
    ).toEqual([["m", { title: "NeurIPS", month: "June", year: "jun" }]]);
  });

  it("stand for their own lower-cased name until their value is read, and for nothing inside it", () => {
    expect(keysAndFields('@string{FOO "x"}\n@misc{a, title = foo}\n\n')).toEqual([["a", { title: "foo" }]]);
    expect(keysAndFields('@string{foo = "A"}\n@string{foo = "B" # }\n@misc{a, title = foo}\n\n')).toEqual([
      ["a", { title: "foo" }],
    ]);
    expect(keysAndFields('@string{foo = "A"}\n@string{foo = foo # "x"}\n@misc{a, title = foo}\n\n')).toEqual([
      ["a", { title: "x" }],
    ]);
    expect(keysAndFields('@string{foo = "A" junk}\n@misc{a, title = foo}\n\n')).toEqual([
      ["a", { title: "A" }],
    ]);
  });

  it("keep the spaces around their value, which the field they end up in then trims", () => {
    expect(
      keysAndFields('@string{foo = { Foo }}\n@misc{a, title = foo # "bar", note = "x" # foo}\n\n'),
    ).toEqual([["a", { title: "Foo bar", note: "x Foo" }]]);
  });

  it("carry over from one file to the next, in the order the document names them", () => {
    const definingFile = { path: "one.bib", text: '@string{venue = "NeurIPS"}\n@misc{a, title = venue}\n' };
    const usingFile = { path: "two.bib", text: "@misc{b, title = venue}\n" };
    expect(keysAndFieldsOfFiles([definingFile, usingFile], BIBTEX_READING_RULES)).toEqual([
      ["a", { title: "NeurIPS" }],
      ["b", { title: "NeurIPS" }],
    ]);
    expect(keysAndFieldsOfFiles([usingFile, definingFile], BIBTEX_READING_RULES)).toEqual([
      ["b", { title: "" }],
      ["a", { title: "NeurIPS" }],
    ]);
  });
});
