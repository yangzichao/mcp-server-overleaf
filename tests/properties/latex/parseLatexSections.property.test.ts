import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  extractSectionText,
  LATEX_SECTION_LEVELS,
  parseLatexSections,
  replaceSectionText,
} from "../../../src/latex/parseLatexSections.js";
import { latexLine } from "../support/latexArbitraries.js";

const headingLine = fc
  .record({
    level: fc.constantFrom(...LATEX_SECTION_LEVELS),
    starred: fc.boolean(),
    shortTitle: fc.option(fc.constantFrom("short", "[x]", "a{b}c"), { nil: undefined }),
    title: fc.constantFrom("Intro", "A {nested} title", "Results \\% done", "北京 𝔸", "", "\\emph{x} y"),
    indentation: fc.constantFrom("", "  ", "\t"),
  })
  .map(
    ({ level, starred, shortTitle, title, indentation }) =>
      `${indentation}\\${level}${starred ? "*" : ""}${shortTitle === undefined ? "" : `[${shortTitle}]`}{${title}}`,
  );

const trailingMatterLine = fc.constantFrom(
  "\\end{document}",
  "\\appendix",
  "\\bibliography{refs}",
  "\\bibliographystyle{plain}",
  "\\printbibliography",
  "\\begin{thebibliography}{9}",
  "% \\end{document}",
  "% \\section{Commented out}",
);

const sectionedDocument = fc
  .array(
    fc.oneof({ weight: 3, arbitrary: headingLine }, { weight: 1, arbitrary: trailingMatterLine }, latexLine),
    { maxLength: 25 },
  )
  .map((lines) => lines.join("\n"));

describe("parseLatexSections properties", () => {
  it("returns sections in order, each inside the file and starting where its heading is", () => {
    fc.assert(
      fc.property(sectionedDocument, (source) => {
        const lineCount = source.split("\n").length;
        const sections = parseLatexSections(source);
        let previousLine = 0;
        let previousColumn = 0;
        for (const section of sections) {
          expect(section.startLine).toBeGreaterThanOrEqual(previousLine);
          if (section.startLine === previousLine) expect(section.startColumn).toBeGreaterThan(previousColumn);
          expect(section.endLine).toBeGreaterThanOrEqual(section.startLine);
          expect(section.endLine).toBeLessThanOrEqual(lineCount);
          expect(section.depth).toBe(LATEX_SECTION_LEVELS.indexOf(section.level));
          previousLine = section.startLine;
          previousColumn = section.startColumn;
        }
      }),
    );
  });

  it("ends a section before the next heading of the same or a shallower level", () => {
    fc.assert(
      fc.property(sectionedDocument, (source) => {
        const sections = parseLatexSections(source);
        sections.forEach((section, index) => {
          const nextSibling = sections.slice(index + 1).find((later) => later.depth <= section.depth);
          if (!nextSibling) return;
          if (section.endLine === nextSibling.startLine) {
            expect(section.endColumn).toBeDefined();
            expect(section.endColumn!).toBeLessThanOrEqual(nextSibling.startColumn);
          } else {
            expect(section.endLine).toBeLessThan(nextSibling.startLine);
          }
        });
      }),
    );
  });

  it("keeps a subsection that starts inside its parent within the parent's lines", () => {
    fc.assert(
      fc.property(sectionedDocument, (source) => {
        const sections = parseLatexSections(source);
        sections.forEach((parent, index) => {
          for (const child of sections.slice(index + 1)) {
            if (
              child.depth > parent.depth &&
              (child.startLine < parent.endLine ||
                (child.startLine === parent.endLine && child.startColumn < (parent.endColumn ?? Infinity)))
            ) {
              expect(child.endLine).toBeLessThanOrEqual(parent.endLine);
            }
          }
        });
      }),
    );
  });

  it("gives back the source unchanged when a section is replaced by its own text", () => {
    fc.assert(
      fc.property(sectionedDocument, (source) => {
        for (const section of parseLatexSections(source)) {
          expect(replaceSectionText(source, section, extractSectionText(source, section))).toBe(source);
        }
      }),
    );
  });

  it("changes nothing outside the section it replaces", () => {
    fc.assert(
      fc.property(sectionedDocument, fc.array(latexLine, { maxLength: 4 }), (source, replacementLines) => {
        const sections = parseLatexSections(source);
        fc.pre(sections.length > 0);
        const section = sections[sections.length - 1]!;
        const lines = source.split("\n");
        const updatedLines = replaceSectionText(source, section, replacementLines.join("\n")).split("\n");
        const replacementLineCount = Math.max(replacementLines.length, 1);
        expect(updatedLines.slice(0, section.startLine - 1)).toEqual(lines.slice(0, section.startLine - 1));
        expect(updatedLines.slice(section.startLine - 1 + replacementLineCount)).toEqual(
          lines.slice(section.endLine),
        );
      }),
    );
  });

  it("ignores a comment added at the end of any line", () => {
    fc.assert(
      fc.property(sectionedDocument, (source) => {
        const commented = source
          .split("\n")
          .map((line) => `${line} % \\section{Hidden} \\end{document}`)
          .join("\n");
        expect(parseLatexSections(commented)).toEqual(parseLatexSections(source));
      }),
    );
  });
});
