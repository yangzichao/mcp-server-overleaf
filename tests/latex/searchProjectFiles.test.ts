import { describe, expect, it } from "vitest";

import {
  formatSearchMatches,
  isSearchableFile,
  searchProjectFiles,
} from "../../src/latex/searchProjectFiles.js";

const files: Record<string, string> = {
  "main.tex": "\\section{Intro}\nThe estimator is consistent.\nAnother line.",
  "sections/method.tex": "We assume CONSISTENCY throughout.",
  "refs.bib": "@article{smith2020, title={Consistent estimation}}",
  "figures/plot.pdf": "binary noise that must never be searched",
};

function search(query: string, options: { isRegularExpression?: boolean; maximumMatches?: number } = {}) {
  return searchProjectFiles({
    trackedFiles: Object.keys(files),
    readTextFile: (path) => Promise.resolve(files[path] ?? ""),
    query,
    isRegularExpression: options.isRegularExpression ?? false,
    maximumMatches: options.maximumMatches ?? 100,
  });
}

describe("isSearchableFile", () => {
  it("accepts LaTeX and bibliography sources", () => {
    for (const path of ["main.tex", "a.ltx", "refs.bib", "custom.cls", "custom.sty", "notes.md"]) {
      expect(isSearchableFile(path)).toBe(true);
    }
  });

  it("rejects binaries that would only produce noise", () => {
    for (const path of ["plot.pdf", "figure.png", "data.xlsx"]) {
      expect(isSearchableFile(path)).toBe(false);
    }
  });
});

describe("searchProjectFiles", () => {
  it("finds a plain substring, ignoring case", async () => {
    const matches = await search("consistent");
    expect(matches.map((m) => [m.path, m.lineNumber])).toEqual([
      ["main.tex", 2],
      ["refs.bib", 1],
    ]);
  });

  it("reports the file, line number and trimmed line", async () => {
    const matches = await search("estimator");
    expect(matches).toEqual([{ path: "main.tex", lineNumber: 2, line: "The estimator is consistent." }]);
  });

  it("matches case-insensitively across files", async () => {
    const matches = await search("consistenc");
    expect(matches.map((m) => m.path)).toEqual(["sections/method.tex"]);
  });

  it("never opens a non-searchable file", async () => {
    const matches = await search("binary noise");
    expect(matches).toEqual([]);
  });

  it("supports regular expressions when asked", async () => {
    const matches = await search("^We assume", { isRegularExpression: true });
    expect(matches.map((m) => m.path)).toEqual(["sections/method.tex"]);
  });

  it("treats the query literally when regular expressions are off", async () => {
    expect(await search("^We assume")).toEqual([]);
  });

  it("stops at the match cap", async () => {
    const matches = await search("e", { maximumMatches: 2 });
    expect(matches).toHaveLength(2);
  });

  it("returns nothing when there is no match", async () => {
    expect(await search("heteroskedasticity")).toEqual([]);
  });
});

describe("a pathological regular expression", () => {
  // (a+)+$ backtracks superlinearly, so an unbounded line would hang the whole server.
  // The searcher truncates each line before matching, which keeps the work bounded.
  it("returns instead of hanging on a long line", async () => {
    const longLine = "a".repeat(60_000);
    const startedAt = Date.now();
    await searchProjectFiles({
      trackedFiles: ["main.tex"],
      readTextFile: () => Promise.resolve(longLine),
      query: "(a+)+$",
      isRegularExpression: true,
      maximumMatches: 10,
    });
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });
});

describe("formatSearchMatches", () => {
  it("renders one grep-style line per match", () => {
    expect(
      formatSearchMatches([
        { path: "main.tex", lineNumber: 2, line: "first" },
        { path: "b.tex", lineNumber: 40, line: "second" },
      ]),
    ).toBe("main.tex:2: first\nb.tex:40: second");
  });

  it("renders an empty list as an empty string", () => {
    expect(formatSearchMatches([])).toBe("");
  });
});
