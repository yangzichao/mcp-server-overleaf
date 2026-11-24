import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findBibliographyResources } from "../../../../src/latex/references/findBibliographySources.js";
import { locateBibliographyFiles } from "../../../../src/latex/references/locateBibliographyFiles.js";
import { visitedSourceFile } from "./visitedSourceFile.js";

const writtenName = fc.constantFrom(
  "refs",
  "refs.bib",
  "../refs",
  "bib/refs",
  "chapters/refs",
  "/etc/refs",
  "北京",
  "a\\b",
);
const naming = fc.oneof(
  fc.array(writtenName, { minLength: 1, maxLength: 3 }).map((names) => `\\bibliography{${names.join(",")}}`),
  writtenName.map((name) => `\\addbibresource{${name.endsWith(".bib") ? name : `${name}.bib`}}`),
);
const visitedFile = fc
  .record({
    path: fc.constantFrom("main.tex", "chapters/intro.tex", "bib/x.tex"),
    baseDirectory: fc.constantFrom("", "chapters"),
    commands: fc.array(naming, { maxLength: 3 }),
  })
  .map(({ path, baseDirectory, commands }) => visitedSourceFile(path, commands.join("\n"), baseDirectory));
const projectFiles = fc
  .uniqueArray(fc.constantFrom("refs.bib", "chapters/refs.bib", "bib/refs.bib", "北京.bib", "main.tex"), {
    maxLength: 5,
  })
  .map((files) => new Set<string>(files));

describe("locateBibliographyFiles properties", () => {
  it("finds each named .bib file in the project once, and lists the rest as missing with what was tried", () => {
    fc.assert(
      fc.property(fc.array(visitedFile, { minLength: 1, maxLength: 3 }), projectFiles, (visited, files) => {
        const { files: found, missing } = locateBibliographyFiles(visited, files);
        for (const path of found) {
          expect(files.has(path)).toBe(true);
          expect(path.split("/")).not.toContain("..");
        }
        expect(new Set(found).size).toBe(found.length);
        for (const absent of missing)
          for (const candidate of absent.tried) expect(files.has(candidate)).toBe(false);

        const named = visited.flatMap(findBibliographyResources);
        expect(missing.length).toBeLessThanOrEqual(named.length);
        expect(found.length).toBeLessThanOrEqual(named.length - missing.length);
        if (named.length > 0 && missing.length === named.length) expect(found).toEqual([]);
      }),
    );
  });
});
