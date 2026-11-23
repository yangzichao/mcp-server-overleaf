import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { IncludeDirective } from "../../../../src/latex/includes/findIncludeDirectives.js";
import { resolveIncludeTarget } from "../../../../src/latex/includes/resolveIncludeTarget.js";

const pathPiece = fc.constantFrom(
  "chapters",
  "intro",
  "intro.tex",
  "..",
  ".",
  "../..",
  "/abs",
  "北京",
  "a b",
);
const writtenPath = fc.array(pathPiece, { minLength: 1, maxLength: 4 }).map((pieces) => pieces.join("/"));
const projectFile = fc.constantFrom(
  "main.tex",
  "intro.tex",
  "intro",
  "chapters/intro.tex",
  "chapters/chapters/intro.tex",
  "北京/intro.tex",
);

const directive: fc.Arbitrary<IncludeDirective> = fc
  .record({
    command: fc.constantFrom("input", "include", "import", "subimport"),
    fileName: writtenPath,
    importDirectory: writtenPath,
  })
  .map(({ command, fileName, importDirectory }) => {
    const isImport = command.endsWith("import");
    return {
      command,
      fileName,
      importDirectory: isImport ? importDirectory : undefined,
      importIsRelative: command === "subimport",
      alwaysAddsTexExtension: command === "include",
      index: 0,
      length: 0,
    };
  });
const includer = fc.record({
  path: fc.constantFrom("main.tex", "chapters/intro.tex", "北京/intro.tex"),
  baseDirectory: fc.constantFrom("", "chapters", "北京"),
});

describe("resolveIncludeTarget properties", () => {
  it("resolves only to a file in the project, or lists as tried only files that are not, without repeats", () => {
    fc.assert(
      fc.property(directive, includer, fc.uniqueArray(projectFile), (written, including, files) => {
        const projectFiles = new Set<string>(files);
        const resolution = resolveIncludeTarget(written, including, projectFiles);
        if (resolution.path !== undefined) {
          expect(projectFiles.has(resolution.path)).toBe(true);
          expect(resolution.path.split("/")).not.toContain("..");
        } else {
          for (const candidate of resolution.tried) expect(projectFiles.has(candidate)).toBe(false);
          expect(new Set(resolution.tried).size).toBe(resolution.tried.length);
        }
      }),
    );
  });

  it("never resolves \\include to a file without the .tex it always appends", () => {
    fc.assert(
      fc.property(directive, includer, fc.uniqueArray(projectFile), (written, including, files) => {
        fc.pre(written.alwaysAddsTexExtension);
        const resolution = resolveIncludeTarget(written, including, new Set<string>(files));
        if (resolution.path !== undefined) expect(resolution.path.toLowerCase().endsWith(".tex")).toBe(true);
      }),
    );
  });
});
