import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { prepareLatexSource, stripLineComment } from "../../../../src/latex/source/prepareLatexSource.js";
import { latexDocument, latexLine } from "../../support/latexArbitraries.js";

function hasUnescapedPercent(line: string): boolean {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "\\") index += 1;
    else if (line[index] === "%") return true;
  }
  return false;
}

const OPAQUE_BEGIN = /\\begin\s*\{(verbatim\*?|Verbatim\*?|lstlisting|minted|comment)\}/;

describe("stripLineComment properties", () => {
  it("returns a prefix of the line with no unescaped percent sign left", () => {
    fc.assert(
      fc.property(latexLine, (line) => {
        const stripped = stripLineComment(line);
        expect(line.startsWith(stripped)).toBe(true);
        expect(hasUnescapedPercent(stripped)).toBe(false);
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(latexLine, (line) => {
        expect(stripLineComment(stripLineComment(line))).toBe(stripLineComment(line));
      }),
    );
  });

  it("keeps a line that has no percent sign whole", () => {
    fc.assert(
      fc.property(latexLine, (line) => {
        fc.pre(!line.includes("%"));
        expect(stripLineComment(line)).toBe(line);
      }),
    );
  });
});

describe("prepareLatexSource properties", () => {
  it("keeps every newline, so line numbers in the prepared text are the file's", () => {
    fc.assert(
      fc.property(latexDocument, (source) => {
        expect(prepareLatexSource(source).split("\n")).toHaveLength(source.split("\n").length);
      }),
    );
  });

  it("only ever shortens a line, keeping a piece of its uncommented text", () => {
    fc.assert(
      fc.property(latexDocument, (source) => {
        const originalLines = source.split("\n");
        prepareLatexSource(source)
          .split("\n")
          .forEach((preparedLine, index) => {
            expect(stripLineComment(originalLines[index] ?? "")).toContain(preparedLine);
          });
      }),
    );
  });

  it("only strips comments when there is no verbatim-like environment", () => {
    fc.assert(
      fc.property(latexDocument, (source) => {
        fc.pre(!OPAQUE_BEGIN.test(source.split("\n").map(stripLineComment).join("\n")));
        expect(prepareLatexSource(source)).toBe(source.split("\n").map(stripLineComment).join("\n"));
      }),
    );
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(latexDocument, (source) => {
        const prepared = prepareLatexSource(source);
        expect(prepareLatexSource(prepared)).toBe(prepared);
      }),
    );
  });
});
