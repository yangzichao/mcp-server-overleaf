import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { flattenLatexDocument } from "../../../../src/latex/flatten/flattenLatexDocument.js";
import { inMemoryProject } from "../../../latex/support/inMemoryProject.js";
import { expectedFlattening } from "./expectedFlattening.js";
import {
  type GeneratedFile,
  type GeneratedProject,
  generatedFile,
  generatedProject,
  ROOT_PATH,
  renderFile,
} from "./generatedLatexProject.js";
import { generatedProjectReader } from "./generatedProjectReader.js";

const MARKER = /% ---- (?:begin (\S+), from ([^\n]*) ----\n|end (\S+) ----)/g;

interface InlinedSpan {
  readonly path: string;
  readonly written: string;
  /** Where the begin marker starts and the end marker ends. */
  readonly start: number;
  readonly end: number;
}

/** Each inlined file's span, checking on the way that the markers nest and that no file is inside itself. */
function readInlinedSpans(text: string): InlinedSpan[] {
  const open: Array<{ path: string; written: string; start: number }> = [];
  const spans: InlinedSpan[] = [];
  for (const marker of text.matchAll(MARKER)) {
    const [whole, beganPath, written, endedPath] = marker;
    if (beganPath !== undefined) {
      expect(beganPath).not.toBe(ROOT_PATH);
      expect(open.map((span) => span.path)).not.toContain(beganPath);
      open.push({ path: beganPath, written: written ?? "", start: marker.index });
    } else {
      const innermost = open.pop();
      expect(innermost?.path).toBe(endedPath);
      if (innermost) spans.push({ ...innermost, end: marker.index + whole.length });
    }
  }
  expect(open).toEqual([]);
  return spans;
}

/** A root whose directives all sit in comments or verbatim-like environments. */
const rootWithoutLiveDirectives: fc.Arbitrary<GeneratedFile> = generatedFile.map((file) => ({
  ...file,
  lines: file.lines.map((line) =>
    line.kind === "opaque" ? line : { ...line, pieces: line.pieces.filter((piece) => piece.kind === "text") },
  ),
}));

/** Directives that name a file outside the project, or that start at the file system's root. */
const OUTSIDE_DIRECTIVES = [
  "\\input{../a}",
  "\\input{../sub/d}",
  "\\include{/a}",
  "\\input{C:/a}",
  "\\import{../}{a}",
  "\\import{/abs/}{a}",
  "\\import{C:/}{a}",
  "\\subimport{../}{a}",
  "\\inputfrom{..}{a}",
  "\\includefrom{../sub}{d}",
  "\\subfile{../sub/d}",
];

describe("flattenLatexDocument properties", () => {
  it("flattens a generated project as the reference model works it out", async () => {
    await fc.assert(
      fc.asyncProperty(generatedProject, async (project) => {
        const flattened = await flattenLatexDocument(generatedProjectReader(project), ROOT_PATH);
        const { text, inlinedFiles, missingIncludes, skippedIncludes } = flattened;
        expect({ text, inlinedFiles, missingIncludes, skippedIncludes }).toEqual(expectedFlattening(project));
      }),
    );
  });

  it("frames each inlined file in nested markers, never inside itself, and an \\include in \\clearpage{}", async () => {
    await fc.assert(
      fc.asyncProperty(generatedProject, async (project) => {
        const { text } = await flattenLatexDocument(generatedProjectReader(project), ROOT_PATH);
        for (const span of readInlinedSpans(text)) {
          if (!/^\\(?:sub)?include/.test(span.written)) continue;
          expect(text.slice(0, span.start).endsWith("\\clearpage{}%\n")).toBe(true);
          expect(text.slice(span.end).startsWith("\n\\clearpage{}")).toBe(true);
        }
      }),
    );
  });

  it("leaves a root whose directives are all commented out or verbatim as it is, reading nothing else", async () => {
    await fc.assert(
      fc.asyncProperty(rootWithoutLiveDirectives, generatedProject, async (root, others) => {
        const project: GeneratedProject = {
          ...others,
          textFiles: new Map([...others.textFiles, [ROOT_PATH, root]]),
        };
        const reader = generatedProjectReader(project);
        const flattened = await flattenLatexDocument(reader, ROOT_PATH);
        expect(flattened.text).toBe(renderFile(root));
        expect(reader.reads).toEqual([ROOT_PATH]);
      }),
    );
  });

  // Found by this property: `\import{../}{a}` once inlined the root's a.tex, because a directory
  // outside the project was turned into the project root before the file name was looked up.
  it("never inlines a file through a path that leaves the project", async () => {
    const directives = fc.array(fc.constantFrom(...OUTSIDE_DIRECTIVES), { minLength: 1, maxLength: 4 });
    await fc.assert(
      fc.asyncProperty(directives, async (written) => {
        const project = inMemoryProject({
          [ROOT_PATH]: `${written.join("\n")}\n`,
          "a.tex": "Root-level a.\n",
          "sub/d.tex": "Sub d.\n",
        });
        const flattened = await flattenLatexDocument(project, ROOT_PATH);
        expect(flattened.inlinedFiles).toEqual([]);
        expect(project.reads).toEqual([ROOT_PATH]);
      }),
    );
  });
});
