import { describe, expect, it } from "vitest";

import { prepareLatexSource } from "../../../src/latex/source/prepareLatexSource.js";
import { joinProjectPath } from "../../../src/latex/source/projectPaths.js";
import { scanSource } from "../../../src/latex/source/scannedSource.js";

describe("prepareLatexSource", () => {
  it("drops comments but keeps an escaped percent sign", () => {
    expect(prepareLatexSource("50\\% done % \\ref{gone}\nnext")).toBe("50\\% done \nnext");
  });

  it("empties verbatim-like bodies and keeps every line", () => {
    const source = [
      "\\begin{lstlisting}[label=lst:code]",
      "\\ref{inside}",
      "\\end{lstlisting}",
      "\\begin{comment}",
      "\\label{hidden}",
      "\\end{comment}",
      "\\ref{outside}",
    ].join("\n");
    const prepared = prepareLatexSource(source);
    expect(prepared.split("\n")).toHaveLength(7);
    expect(prepared).toContain("[label=lst:code]");
    expect(prepared).not.toContain("inside");
    expect(prepared).not.toContain("hidden");
    expect(prepared.split("\n")[6]).toBe("\\ref{outside}");
  });

  it("empties to the end of the file when an environment is never closed", () => {
    expect(prepareLatexSource("\\begin{verbatim}\n\\ref{a}\n\\ref{b}")).toBe("\\begin{verbatim}\n\n");
  });
});

describe("scanSource", () => {
  it("turns an index into a 1-indexed line", () => {
    const source = scanSource("main.tex", "one\ntwo\nthree");
    expect(source.lineAt(0)).toBe(1);
    expect(source.lineAt(3)).toBe(1);
    expect(source.lineAt(4)).toBe(2);
    expect(source.lineAt(12)).toBe(3);
  });
});

describe("joinProjectPath", () => {
  it("collapses dot segments and refuses to leave the project", () => {
    expect(joinProjectPath("chapters", "../figures/./plot.png")).toBe("figures/plot.png");
    expect(joinProjectPath("", "../outside.tex")).toBeNull();
    expect(joinProjectPath("", "/etc/passwd")).toBeNull();
  });
});
