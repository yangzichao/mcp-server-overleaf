import { describe, expect, it } from "vitest";

import {
  extractSectionText,
  findSectionByTitle,
  parseLatexSections,
  replaceSectionText,
} from "../../src/latex/parseLatexSections.js";

/** Rewrites the named section and returns the whole file, the way edit_section does. */
function rewriteSection(source: string, title: string, replacement: string): string {
  const section = findSectionByTitle(parseLatexSections(source), title);
  if (!section) throw new Error(`no section titled ${title}`);
  return replaceSectionText(source, section, replacement);
}

describe("parseLatexSections", () => {
  it("finds each sectioning command with its line range", () => {
    const source = ["\\section{One}", "a", "\\subsection{One A}", "b", "\\section{Two}", "c"].join("\n");
    expect(parseLatexSections(source).map((s) => [s.title, s.startLine, s.endLine])).toEqual([
      ["One", 1, 4],
      ["One A", 3, 4],
      ["Two", 5, 6],
    ]);
  });

  it("resolves the long title of \\section[short]{long}", () => {
    expect(parseLatexSections("\\section[Intro]{A Longer Introduction}")[0]?.title).toBe(
      "A Longer Introduction",
    );
  });

  it("tolerates nested braces in a title", () => {
    expect(parseLatexSections("\\section{Estimating $\\hat{\\theta}$ well}")[0]?.title).toBe(
      "Estimating $\\hat{\\theta}$ well",
    );
  });

  it("ignores a sectioning command inside a comment", () => {
    expect(parseLatexSections("% \\section{Not real}\n\\section{Real}").map((s) => s.title)).toEqual([
      "Real",
    ]);
  });

  it("treats a starred section as a section", () => {
    expect(parseLatexSections("\\section*{Unnumbered}")[0]?.title).toBe("Unnumbered");
  });
});

describe("section boundaries against trailing matter", () => {
  it("stops the last section before \\end{document}", () => {
    const source = "\\section{Intro}\na\n\\section{Conclusion}\nb\n\\end{document}";
    expect(parseLatexSections(source).at(-1)?.endLine).toBe(4);
  });

  it("keeps \\end{document} when the last section is rewritten", () => {
    const source = "\\section{Intro}\na\n\\section{Conclusion}\nb\n\\end{document}";
    expect(rewriteSection(source, "Conclusion", "\\section{Conclusion}\nnew")).toBe(
      "\\section{Intro}\na\n\\section{Conclusion}\nnew\n\\end{document}",
    );
  });

  it("keeps the bibliography when the last section is rewritten", () => {
    const source = [
      "\\section{Intro}",
      "a",
      "\\section{Conclusion}",
      "b",
      "\\bibliographystyle{plain}",
      "\\bibliography{refs}",
      "\\end{document}",
    ].join("\n");
    expect(rewriteSection(source, "Conclusion", "\\section{Conclusion}\nnew")).toContain(
      "\\bibliography{refs}",
    );
  });

  it("stops before \\printbibliography", () => {
    expect(parseLatexSections("\\section{Only}\na\n\\printbibliography\n\\end{document}")[0]?.endLine).toBe(
      2,
    );
  });

  it("stops before \\begin{thebibliography}", () => {
    const source = "\\section{Only}\na\n\\begin{thebibliography}{9}\n\\end{thebibliography}";
    expect(parseLatexSections(source)[0]?.endLine).toBe(2);
  });

  it("ends the last body section at \\appendix but still parses appendix sections", () => {
    const source = "\\section{Body}\na\n\\appendix\n\\section{Extra}\nb\n\\end{document}";
    const sections = parseLatexSections(source);
    expect(sections.map((s) => [s.title, s.endLine])).toEqual([
      ["Body", 2],
      ["Extra", 5],
    ]);
  });

  it("does not end a section at a commented-out \\end{document}", () => {
    expect(parseLatexSections("\\section{A}\na\n% \\end{document}\nb\n\\end{document}")[0]?.endLine).toBe(4);
  });

  it("runs to end of file in an included fragment with no trailing matter", () => {
    expect(parseLatexSections("\\section{A}\na\n\\section{B}\nb").at(-1)?.endLine).toBe(4);
  });

  it("bounds a parent section and its subsection by the same trailing matter", () => {
    const sections = parseLatexSections("\\section{A}\na\n\\subsection{A1}\nb\n\\end{document}");
    expect(sections.map((s) => s.endLine)).toEqual([4, 4]);
  });

  it("never returns an end line before the heading itself", () => {
    const sections = parseLatexSections("\\section{Empty}\n\\end{document}");
    expect(sections[0]?.endLine).toBe(sections[0]?.startLine);
  });
});

describe("findSectionByTitle", () => {
  const sections = parseLatexSections("\\section{Introduction}\na\n\\section{Empirical Strategy}\nb");

  it("matches exactly, ignoring case", () => {
    expect(findSectionByTitle(sections, "iNtRoDuCtIoN")?.title).toBe("Introduction");
  });

  it("falls back to a substring match", () => {
    expect(findSectionByTitle(sections, "Empirical")?.title).toBe("Empirical Strategy");
  });

  it("returns null when nothing matches", () => {
    expect(findSectionByTitle(sections, "Conclusion")).toBeNull();
  });

  it("prefers the exact match over an earlier substring match", () => {
    const withOverlap = parseLatexSections("\\section{Results and Discussion}\na\n\\section{Results}\nb");
    expect(findSectionByTitle(withOverlap, "Results")?.startLine).toBe(3);
  });
});

describe("extractSectionText", () => {
  it("returns the heading together with its body", () => {
    const source = "\\section{One}\nbody\n\\section{Two}\nother";
    const section = findSectionByTitle(parseLatexSections(source), "One");
    expect(extractSectionText(source, section!)).toBe("\\section{One}\nbody");
  });
});
