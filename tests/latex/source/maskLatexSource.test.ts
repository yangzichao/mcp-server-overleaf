import { describe, expect, it } from "vitest";

import { maskLatexSource, prepareLatexSource } from "../../../src/latex/source/prepareLatexSource.js";

describe("maskLatexSource", () => {
  const source = [
    "Text 100\\% sure % a comment \\input{old}",
    "\\begin{lstlisting}[label=code]",
    "\\input{listing}",
    "\\end{lstlisting}",
    "\\\\% after a line break",
  ].join("\n");

  it("blanks comments and opaque bodies with spaces, so every index is the index in the file", () => {
    const masked = maskLatexSource(source);
    expect(masked).toHaveLength(source.length);
    expect(masked.split("\n")).toEqual([
      `Text 100\\% sure ${" ".repeat("% a comment \\input{old}".length)}`,
      "\\begin{lstlisting}[label=code]",
      " ".repeat("\\input{listing}".length),
      "\\end{lstlisting}",
      `\\\\${" ".repeat("% after a line break".length)}`,
    ]);
  });

  it("reads the same text as prepareLatexSource once the blanks are gone", () => {
    const withoutBlanks = (text: string) => text.replace(/ +$/gm, "").replace(/^ +$/gm, "");
    expect(withoutBlanks(maskLatexSource(source))).toBe(withoutBlanks(prepareLatexSource(source)));
  });
});
