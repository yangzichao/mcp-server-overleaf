import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { outlineLatexDocument } from "../../../../src/latex/outline/outlineLatexDocument.js";
import { parseLatexSections } from "../../../../src/latex/parseLatexSections.js";
import { inMemoryProject } from "../../../latex/support/inMemoryProject.js";

const FILE_NAMES = ["main", "intro", "methods", "chapters/results"] as const;

const sourceLine = fc.oneof(
  fc.constantFrom(
    "\\section{One}",
    "\\subsection{Two}",
    "\\chapter{Three}",
    "Some prose.",
    "",
    "% \\section{Hidden}",
  ),
  fc.constantFrom(...FILE_NAMES).map((name) => `\\input{${name}}`),
  fc.constantFrom(...FILE_NAMES).map((name) => `\\include{${name}}`),
  fc.constant("\\input{missing}"),
);
const project = fc.record(
  Object.fromEntries(
    FILE_NAMES.map((name) => [name, fc.array(sourceLine, { maxLength: 8 }).map((lines) => lines.join("\n"))]),
  ) as Record<(typeof FILE_NAMES)[number], fc.Arbitrary<string>>,
);

function toProjectFiles(sources: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(sources).map(([name, text]) => [`${name}.tex`, text]));
}

describe("outlineLatexDocument properties", () => {
  it("lists each heading of each reached file once, in that file's own order, with its own line numbers", async () => {
    await fc.assert(
      fc.asyncProperty(project, async (sources) => {
        const files = toProjectFiles(sources);
        const outline = await outlineLatexDocument(inMemoryProject(files), "main.tex");
        for (const path of outline.checkedFiles) {
          const fromOutline = outline.headings
            .filter((heading) => heading.path === path)
            .map((heading) => heading.section);
          expect(fromOutline).toEqual(parseLatexSections(files[path] ?? ""));
        }
        expect(outline.headings.every((heading) => outline.checkedFiles.includes(heading.path))).toBe(true);
      }),
    );
  });

  it("checks the root first and each file once, however files include each other", async () => {
    await fc.assert(
      fc.asyncProperty(project, async (sources) => {
        const outline = await outlineLatexDocument(inMemoryProject(toProjectFiles(sources)), "main.tex");
        expect(outline.checkedFiles[0]).toBe("main.tex");
        expect(new Set(outline.checkedFiles).size).toBe(outline.checkedFiles.length);
      }),
    );
  });

  it("gives a file with no includes exactly its own sections", async () => {
    await fc.assert(
      fc.asyncProperty(project, async ({ main }) => {
        const withoutIncludes = main.replace(/\\(input|include)\{[^}]*\}/g, "");
        const outline = await outlineLatexDocument(
          inMemoryProject({ "main.tex": withoutIncludes }),
          "main.tex",
        );
        expect(outline.headings.map((heading) => heading.section)).toEqual(
          parseLatexSections(withoutIncludes),
        );
      }),
    );
  });
});
