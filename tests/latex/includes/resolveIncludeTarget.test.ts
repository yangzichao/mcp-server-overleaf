import { describe, expect, it } from "vitest";

import type { IncludeDirective } from "../../../src/latex/includes/findIncludeDirectives.js";
import { resolveIncludeTarget } from "../../../src/latex/includes/resolveIncludeTarget.js";

function importDirective(command: string, importDirectory: string, fileName: string): IncludeDirective {
  return {
    command,
    fileName,
    importDirectory,
    importIsRelative: command.startsWith("sub"),
    alwaysAddsTexExtension: command.includes("include"),
    index: 0,
    length: 0,
  };
}

const PROJECT_FILES = new Set(["main.tex", "a.tex", "chapters/a.tex"]);
const MAIN = { path: "main.tex", baseDirectory: "" };

describe("resolveIncludeTarget", () => {
  it("finds an import in the project root, however the root is written", () => {
    for (const directory of ["", "./", "chapters/.."]) {
      expect(resolveIncludeTarget(importDirective("import", directory, "a"), MAIN, PROJECT_FILES)).toEqual({
        path: "a.tex",
        baseDirectory: "",
      });
    }
  });

  it("finds no file through an import directory outside the project", () => {
    for (const [command, directory] of [
      ["import", "../"],
      ["import", "/abs/"],
      ["import", "C:/"],
      ["subimport", "../"],
      ["inputfrom", ".."],
    ] as const) {
      expect(resolveIncludeTarget(importDirective(command, directory, "a"), MAIN, PROJECT_FILES)).toEqual({
        path: undefined,
        tried: [],
      });
    }
  });

  it("still tries the including file's own directory when the import's base is outside", () => {
    const includer = { path: "chapters/one.tex", baseDirectory: "" };
    expect(
      resolveIncludeTarget(importDirective("subimport", "../chapters", "a"), includer, PROJECT_FILES),
    ).toEqual({
      path: "chapters/a.tex",
      baseDirectory: "chapters",
    });
  });
});
