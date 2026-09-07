import { describe, expect, it } from "vitest";

import {
  categorizeProjectFile,
  categorizeProjectFiles,
  containsDocumentEnvironment,
  guessMainTexFile,
} from "../../src/latex/latexProjectFiles.js";

describe("categorizeProjectFile", () => {
  it("sorts the common kinds apart", () => {
    expect(categorizeProjectFile("main.tex")).toBe("tex");
    expect(categorizeProjectFile("refs.bib")).toBe("bibliography");
    expect(categorizeProjectFile("figures/plot.pdf")).toBe("figure");
  });

  it("ignores case in the extension", () => {
    expect(categorizeProjectFile("MAIN.TEX")).toBe("tex");
  });
});

describe("categorizeProjectFiles", () => {
  it("keeps every input file, paired with its category", () => {
    expect(categorizeProjectFiles(["main.tex", "refs.bib", "plot.png", "notes.md"])).toEqual([
      { path: "main.tex", category: "tex" },
      { path: "refs.bib", category: "bibliography" },
      { path: "plot.png", category: "figure" },
      { path: "notes.md", category: "other" },
    ]);
  });
});

describe("guessMainTexFile", () => {
  it("prefers main.tex", () => {
    expect(guessMainTexFile(["sections/intro.tex", "main.tex", "refs.bib"])).toBe("main.tex");
  });

  it("falls back to the only .tex file", () => {
    expect(guessMainTexFile(["paper.tex", "refs.bib"])).toBe("paper.tex");
  });

  it("prefers a root-level file over a nested one", () => {
    const guessed = guessMainTexFile(["sections/intro.tex", "sections/method.tex", "paper.tex"]);
    expect(guessed).toBe("paper.tex");
  });

  it("returns null when there is no .tex file at all", () => {
    expect(guessMainTexFile(["refs.bib", "plot.png"])).toBeNull();
  });

  it("returns null for an empty project", () => {
    expect(guessMainTexFile([])).toBeNull();
  });
});

describe("containsDocumentEnvironment", () => {
  it("recognises a root document", () => {
    expect(
      containsDocumentEnvironment("\\documentclass{article}\n\\begin{document}\nhi\n\\end{document}"),
    ).toBe(true);
  });

  it("tolerates whitespace inside the command", () => {
    expect(containsDocumentEnvironment("\\begin {document}")).toBe(true);
  });

  it("rejects an included fragment", () => {
    expect(containsDocumentEnvironment("\\section{Intro}\nSome prose.")).toBe(false);
  });
});
