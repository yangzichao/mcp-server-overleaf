import { describe, expect, it } from "vitest";

import { RegularExpressionBudgetExceededError } from "../../src/latex/boundedRegexSearch.js";
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
  const BUDGET_MS = 1500;

  /**
   * `(a+)+$` backtracks exponentially in the length of the line: 24 characters take about
   * 150ms and 30 characters take ten seconds. The trailing "b" is the whole point. It is
   * what forces the match to fail and the backtracking to happen; against a line of
   * nothing but "a" the same pattern succeeds on the first greedy pass in no time at all
   * and proves nothing, however long the line is.
   *
   * Two hundred characters, well inside the line-length cap, is already unbounded. That
   * cap limits wasted work; it is not what makes this safe.
   */
  const catastrophicLine = `${"a".repeat(200)}b`;

  const searchCatastrophically = () =>
    searchProjectFiles({
      trackedFiles: ["main.tex"],
      readTextFile: () => Promise.resolve(catastrophicLine),
      query: "(a+)+$",
      isRegularExpression: true,
      maximumMatches: 10,
      regularExpressionBudgetMs: BUDGET_MS,
    });

  it("is abandoned at its deadline rather than running forever", async () => {
    const startedAt = Date.now();
    const failure = await searchCatastrophically().catch((caught: unknown) => caught);

    expect(failure).toBeInstanceOf(RegularExpressionBudgetExceededError);
    // The lower bound matters as much as the upper one: a pattern that failed instantly
    // for some unrelated reason would satisfy the upper bound on its own.
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(BUDGET_MS - 200);
    expect(elapsed).toBeLessThan(BUDGET_MS + 8000);
  }, 30_000);

  it("leaves the main thread responsive while it burns its budget", async () => {
    let timerFirings = 0;
    const ticker = setInterval(() => {
      timerFirings += 1;
    }, 20);

    try {
      await searchCatastrophically().catch(() => undefined);
    } finally {
      clearInterval(ticker);
    }

    // Matched on this thread, the regex would block every timer and this would be 0.
    // This is the assertion that the work really is off the event loop.
    expect(timerFirings).toBeGreaterThan(10);
  }, 30_000);

  it("still reports a malformed pattern as an ordinary argument error", async () => {
    await expect(search("(unclosed", { isRegularExpression: true })).rejects.toThrow(
      /Invalid regular expression/,
    );
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
