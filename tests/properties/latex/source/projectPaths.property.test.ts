import { posix } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findFirstExistingPath, joinProjectPath } from "../../../../src/latex/source/projectPaths.js";

const pathSegment = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom("..", ".", "", "chapters", "figures", "a b", "...", "..x", "x..") },
  { weight: 1, arbitrary: fc.constantFrom("北京", "𝔸", "back\\slash", "C:", ".git", " ") },
  { weight: 2, arbitrary: fc.string({ maxLength: 4 }).filter((segment) => !segment.includes("/")) },
);
const relativeDirectory = fc
  .array(fc.constantFrom("chapters", "sections", "a", "北京"), { maxLength: 3 })
  .map((segments) => segments.join("/"));
const writtenPath = fc.oneof(
  fc.array(pathSegment, { maxLength: 6 }).map((segments) => segments.join("/")),
  fc.constantFrom("/etc/passwd", "C:/x.tex", "c:x.tex", "//server/share"),
);

/** What the result should be, by way of POSIX normalisation: null once it is absolute or above the root. */
function expectedJoin(directory: string, written: string): string | null {
  if (written.startsWith("/") || /^[A-Za-z]:/.test(written)) return null;
  const normalized = posix.normalize(`${directory}/${written}`.replace(/^\/+/, "")).replace(/\/$/, "");
  if (normalized === "." || normalized === "" || normalized === ".." || normalized.startsWith("../"))
    return null;
  return normalized;
}

describe("joinProjectPath properties", () => {
  it("agrees with POSIX normalisation inside the project and is null outside it", () => {
    fc.assert(
      fc.property(relativeDirectory, writtenPath, (directory, written) => {
        expect(joinProjectPath(directory, written)).toBe(expectedJoin(directory, written));
      }),
    );
  });

  it("never returns an absolute path or one with an empty, dot or dot-dot segment", () => {
    fc.assert(
      fc.property(relativeDirectory, writtenPath, (directory, written) => {
        const joined = joinProjectPath(directory, written);
        if (joined === null) return;
        expect(joined.startsWith("/")).toBe(false);
        for (const segment of joined.split("/")) expect(["", ".", ".."]).not.toContain(segment);
      }),
    );
  });
});

describe("findFirstExistingPath properties", () => {
  it("finds only files that exist, and lists as tried only files that do not, each once", () => {
    fc.assert(
      fc.property(
        fc.array(relativeDirectory, { maxLength: 4 }),
        fc.array(writtenPath, { maxLength: 4 }),
        fc.array(fc.constantFrom("main.tex", "chapters/intro.tex", "a/b.tex", "北京.tex"), { maxLength: 4 }),
        (directories, fileNames, existing) => {
          const projectFiles = new Set<string>(existing);
          const lookup = findFirstExistingPath(directories, fileNames, projectFiles);
          if ("found" in lookup) {
            expect(projectFiles.has(lookup.found)).toBe(true);
          } else {
            for (const candidate of lookup.tried) expect(projectFiles.has(candidate)).toBe(false);
            expect(new Set(lookup.tried).size).toBe(lookup.tried.length);
          }
        },
      ),
    );
  });
});
