import { describe, expect, it } from "vitest";

import {
  extractSectionText,
  parseLatexSections,
  replaceSectionText,
} from "../../src/latex/parseLatexSections.js";

describe("the source range of a section edit", () => {
  it("reads and rewrites the real heading after a verbatim example", () => {
    const example = String.raw`\begin{verbatim}
\section{Results}
\end{verbatim}
`;
    const original = `${example}\\section{Results}\nOld body.\n\\end{document}`;
    const sections = parseLatexSections(original);
    expect(sections.map((section) => section.title)).toEqual(["Results"]);
    expect(extractSectionText(original, sections[0]!)).toBe("\\section{Results}\nOld body.");
    expect(replaceSectionText(original, sections[0]!, "\\section{Results}\nNew body.")).toBe(
      `${example}\\section{Results}\nNew body.\n\\end{document}`,
    );
  });

  it.each(["\\end{document}", "\\bibliography{refs}", "\\printbibliography", "\\appendix"])(
    "preserves an inline %s on the heading line or a body line",
    (trailingCommand) => {
      for (const separator of [" ", "\n"]) {
        const sectionText = `\\section{Results}${separator}Old.`;
        const original = sectionText + trailingCommand;
        const [section] = parseLatexSections(original);
        expect(extractSectionText(original, section!)).toBe(sectionText);
        expect(replaceSectionText(original, section!, "\\section{Results} New.")).toBe(
          `\\section{Results} New.${trailingCommand}`,
        );
      }
    },
  );

  it("keeps prose and sibling headings that share a line with the edited section", () => {
    const text = "前文。\\section{A}one\\section{B}two\\end{document}";
    const sections = parseLatexSections(text);
    expect(sections.map((section) => section.title)).toEqual(["A", "B"]);
    expect(replaceSectionText(text, sections[0]!, "\\section{A}new")).toBe(text.replace("one", "new"));
  });
  it("keeps a line break followed by literal command-like text inside the section", () => {
    const source = String.raw`\section{Intro}a\\end{document} more\end{document}`;
    const [section] = parseLatexSections(source);
    expect(extractSectionText(source, section!)).toBe(String.raw`\section{Intro}a\\end{document} more`);
  });
});
