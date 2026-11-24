import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type SearchableDocument,
  searchDocumentsWithBoundedRegex,
} from "../../../src/latex/boundedRegexSearch.js";
import type { ProjectSearchMatch } from "../../../src/latex/searchProjectFiles.js";

const RUNS_AFFORDABLE_WHEN_EVERY_SEARCH_STARTS_A_WORKER = 30;

const pattern = fc.constantFrom("a", "^\\s*\\\\", "x$", "[0-9]+", "北", "(?:ab)+", "", ".", "\\bsec", "𝔸");
const line = fc
  .array(fc.constantFrom("a", "b", "x", " ", "\t", "\\", "1", "sec", "北", "𝔸", "%"), { maxLength: 10 })
  .map((pieces) => pieces.join(""));
const documents: fc.Arbitrary<SearchableDocument[]> = fc.array(
  fc.record({
    path: fc.constantFrom("main.tex", "a/b.tex", "北京.tex"),
    lines: fc.array(line, { maxLength: 5 }),
  }),
  { maxLength: 3 },
);

function naiveSearch(
  written: string,
  searched: readonly SearchableDocument[],
  maximumMatches: number,
  maximumLineLength: number,
): ProjectSearchMatch[] {
  const expression = new RegExp(written, "i");
  return searched
    .flatMap((document) =>
      document.lines.flatMap((text, index) =>
        expression.test(text.slice(0, maximumLineLength))
          ? [{ path: document.path, lineNumber: index + 1, line: text.trim() }]
          : [],
      ),
    )
    .slice(0, maximumMatches);
}

describe("searchDocumentsWithBoundedRegex properties", () => {
  it("finds the lines a search on this thread finds, in order, up to the cap, testing only each line's start", async () => {
    await fc.assert(
      fc.asyncProperty(
        pattern,
        documents,
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 12 }),
        async (written, searched, maximumMatches, maximumLineLength) => {
          const matches = await searchDocumentsWithBoundedRegex({
            pattern: written,
            documents: searched,
            maximumMatches,
            maximumLineLength,
            budgetMs: 10_000,
          });
          expect(matches).toEqual(naiveSearch(written, searched, maximumMatches, maximumLineLength));
        },
      ),
      { numRuns: RUNS_AFFORDABLE_WHEN_EVERY_SEARCH_STARTS_A_WORKER },
    );
  });

  it("refuses a pattern that does not compile with the SyntaxError RegExp gives, before starting a worker", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("(", "[", "a{2,1}", "\\", "(?<", "*", "a)"),
        documents,
        async (written, searched) => {
          await expect(
            searchDocumentsWithBoundedRegex({
              pattern: written,
              documents: searched,
              maximumMatches: 5,
              maximumLineLength: 100,
              budgetMs: 10_000,
            }),
          ).rejects.toThrow(SyntaxError);
        },
      ),
    );
  });
});
