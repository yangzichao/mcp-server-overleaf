import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  categorizeProjectFile,
  containsDocumentEnvironment,
  guessMainTexFile,
  LATEX_FILE_CATEGORIES,
} from "../../../src/latex/latexProjectFiles.js";
import { latexTextWithLineBreaksAnywhere } from "../support/latexArbitraries.js";

const extension = fc.constantFrom(
  "tex",
  "TeX",
  "ltx",
  "bib",
  "BBL",
  "png",
  "Pdf",
  "sty",
  "log",
  "synctex",
  "txt",
  "",
);
const projectPath = fc
  .record({
    directories: fc.array(fc.constantFrom("chapters", "figures", "a.b", "北京"), { maxLength: 3 }),
    stem: fc.constantFrom("main", "MAIN", "paper", "intro", "x", "thesis", "a.tex", ""),
    extension,
  })
  .map(({ directories, stem, extension: suffix }) =>
    [...directories, suffix === "" ? stem : `${stem}.${suffix}`].join("/"),
  );

describe("categorizeProjectFile properties", () => {
  it("always gives one of the documented categories", () => {
    fc.assert(
      fc.property(fc.oneof(projectPath, fc.string()), (path) => {
        expect(LATEX_FILE_CATEGORIES).toContain(categorizeProjectFile(path));
      }),
    );
  });

  it("depends only on the extension, whatever its case", () => {
    fc.assert(
      fc.property(projectPath, fc.constantFrom("other/dir", "", "x.y"), (path, otherDirectory) => {
        const fileName = path.split("/").pop() ?? "";
        const moved = otherDirectory === "" ? fileName : `${otherDirectory}/${fileName}`;
        expect(categorizeProjectFile(moved.toUpperCase())).toBe(categorizeProjectFile(path));
      }),
    );
  });
});

describe("guessMainTexFile properties", () => {
  it("returns a .tex file from the list, or null exactly when the list has none", () => {
    fc.assert(
      fc.property(fc.array(projectPath, { maxLength: 8 }), (paths) => {
        const guess = guessMainTexFile(paths);
        const texFiles = paths.filter((path) => categorizeProjectFile(path) === "tex");
        if (texFiles.length === 0) expect(guess).toBeNull();
        else expect(texFiles).toContain(guess);
      }),
    );
  });

  it("never picks a nested file while a .tex file sits at the root", () => {
    fc.assert(
      fc.property(fc.array(projectPath, { maxLength: 8 }), (paths) => {
        const guess = guessMainTexFile(paths);
        if (guess === null || !guess.includes("/")) return;
        const rootTexFiles = paths.filter(
          (path) => !path.includes("/") && categorizeProjectFile(path) === "tex",
        );
        expect(rootTexFiles).toEqual([]);
      }),
    );
  });
});

describe("containsDocumentEnvironment properties", () => {
  it("is true once \\begin{document} is added anywhere, with any spacing", () => {
    fc.assert(
      fc.property(
        latexTextWithLineBreaksAnywhere,
        latexTextWithLineBreaksAnywhere,
        fc.constantFrom("", " ", "\n", "  \t"),
        (before, after, spacing) => {
          expect(containsDocumentEnvironment(`${before}\\begin${spacing}{document}${after}`)).toBe(true);
        },
      ),
    );
  });
});
