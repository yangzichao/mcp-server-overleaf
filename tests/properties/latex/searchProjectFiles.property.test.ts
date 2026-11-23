import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  isSearchableFile,
  type ProjectSearchMatch,
  searchProjectFiles,
} from "../../../src/latex/searchProjectFiles.js";
import { latexDocument } from "../support/latexArbitraries.js";

const filePath = fc.constantFrom(
  "main.tex",
  "refs.bib",
  "notes.md",
  "figure.png",
  "paper.PDF",
  "style.sty",
  "a/b.TEX",
);
const projectFiles = fc.dictionary(filePath, latexDocument, { maxKeys: 5 });
const asciiProjectFiles = fc.dictionary(
  filePath,
  fc
    .array(fc.stringMatching(/^[A-Za-z0-9 .,{}\\%$-]{0,20}$/), { maxLength: 8 })
    .map((lines) => lines.join("\n")),
  { maxKeys: 4 },
);

function naiveSubstringSearch(
  files: Record<string, string>,
  query: string,
  maximumMatches: number,
): ProjectSearchMatch[] {
  const matches: ProjectSearchMatch[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (!isSearchableFile(path)) continue;
    content.split("\n").forEach((line, index) => {
      if (line.toLowerCase().includes(query.toLowerCase()))
        matches.push({ path, lineNumber: index + 1, line: line.trim() });
    });
  }
  return matches.slice(0, maximumMatches);
}

function readFrom(files: Record<string, string>) {
  return (path: string) => Promise.resolve(files[path] ?? "");
}

function escapeRegularExpression(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const RUNS_AFFORDABLE_WHEN_EVERY_SEARCH_STARTS_A_WORKER = 30;

describe("searchProjectFiles properties", () => {
  it("finds a plain query on exactly the lines a naive case-insensitive scan does, up to the cap", async () => {
    await fc.assert(
      fc.asyncProperty(
        projectFiles,
        fc.constantFrom("section", "\\", "{", "%", "北京", "word", "e", ""),
        fc.integer({ min: 1, max: 20 }),
        async (files, query, maximumMatches) => {
          const matches = await searchProjectFiles({
            trackedFiles: Object.keys(files),
            readTextFile: readFrom(files),
            query,
            isRegularExpression: false,
            maximumMatches,
          });
          expect(matches).toEqual(naiveSubstringSearch(files, query, maximumMatches));
        },
      ),
    );
  });

  it("finds the same lines for an escaped regular expression as for the plain query, in ASCII text", async () => {
    await fc.assert(
      fc.asyncProperty(
        asciiProjectFiles,
        fc.stringMatching(/^[A-Za-z0-9 .{}\\%$-]{1,3}$/),
        fc.integer({ min: 1, max: 20 }),
        async (files, query, maximumMatches) => {
          const search = (isRegularExpression: boolean) =>
            searchProjectFiles({
              trackedFiles: Object.keys(files),
              readTextFile: readFrom(files),
              query: isRegularExpression ? escapeRegularExpression(query) : query,
              isRegularExpression,
              maximumMatches,
            });
          expect(await search(true)).toEqual(await search(false));
        },
      ),
      { numRuns: RUNS_AFFORDABLE_WHEN_EVERY_SEARCH_STARTS_A_WORKER },
    );
  });
});
