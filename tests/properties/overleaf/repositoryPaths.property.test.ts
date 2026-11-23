import { isAbsolute, join, relative, sep } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  resolvePathInsideRepository,
  UnsafeRepositoryPathError,
} from "../../../src/overleaf/repositoryPaths.js";

const REPOSITORY = "/tmp/overleaf-clone";

const hostileSegment = fc.constantFrom(
  "..",
  ".",
  "",
  ".git",
  ".GIT",
  ".Git",
  "...",
  "..\\..",
  "C:",
  "~",
  " ",
  "\0",
  "北京",
  "𝔸",
  "%2e%2e",
);
const ordinarySegment = fc.oneof(
  fc.constantFrom("main.tex", "chapters", "figures", ".gitignore", "a b", "naïve", "😀.tex", "x..y"),
  fc.stringMatching(/^[A-Za-z0-9_-]{1,6}$/),
);
const clientPath = fc.oneof(
  fc.array(fc.oneof(hostileSegment, ordinarySegment), { maxLength: 6 }).map((segments) => segments.join("/")),
  fc
    .array(fc.oneof(hostileSegment, ordinarySegment), { minLength: 1, maxLength: 4 })
    .map((segments) => `/${segments.join("/")}`),
  fc.string(),
);

describe("resolvePathInsideRepository properties", () => {
  it("either refuses with UnsafeRepositoryPathError or returns a path strictly inside the clone and outside .git", () => {
    fc.assert(
      fc.property(clientPath, (requestedPath) => {
        let resolved: string;
        try {
          resolved = resolvePathInsideRepository(REPOSITORY, requestedPath);
        } catch (error) {
          expect(error).toBeInstanceOf(UnsafeRepositoryPathError);
          return;
        }
        const inside = relative(REPOSITORY, resolved);
        expect(resolved.startsWith(`${REPOSITORY}${sep}`)).toBe(true);
        expect(inside).not.toBe("");
        expect(isAbsolute(inside)).toBe(false);
        expect(inside.split(sep)).not.toContain("..");
        expect(inside.split(sep)[0]?.toLowerCase()).not.toBe(".git");
      }),
    );
  });

  it("accepts any path made of ordinary names and resolves it under the clone", () => {
    fc.assert(
      fc.property(fc.array(ordinarySegment, { minLength: 1, maxLength: 5 }), (segments) => {
        fc.pre(segments[0]?.toLowerCase() !== ".git");
        expect(resolvePathInsideRepository(REPOSITORY, segments.join("/"))).toBe(
          join(REPOSITORY, ...segments),
        );
      }),
    );
  });

  // Found by this property: "..notes.tex" was once refused as outside the project, because the
  // check read any relative path starting with ".." as a climb out of the clone.
  it("accepts a top-level file whose name only starts with two dots", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\.\.[A-Za-z0-9_-]{1,8}(\.tex)?$/), (fileName) => {
        expect(resolvePathInsideRepository(REPOSITORY, fileName)).toBe(join(REPOSITORY, fileName));
      }),
    );
  });
});
