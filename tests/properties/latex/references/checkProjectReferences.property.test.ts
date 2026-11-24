import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkProjectReferences } from "../../../../src/latex/references/checkProjectReferences.js";
import { inMemoryProject } from "../../../latex/support/inMemoryProject.js";
import { latexDocument } from "../../support/latexArbitraries.js";

const key: fc.Arbitrary<string> = fc.constantFrom(
  "a",
  "b",
  "sec:x",
  "fig:1",
  "LastPage",
  "Smith2020",
  "smith2020",
);

type Token =
  | { readonly kind: "label"; readonly key: string }
  | { readonly kind: "reference"; readonly key: string; readonly command: string }
  | { readonly kind: "citation"; readonly key: string; readonly command: string };

const token: fc.Arbitrary<Token> = fc.oneof(
  key.map((written) => ({ kind: "label" as const, key: written })),
  fc.record({
    kind: fc.constant("reference" as const),
    key,
    command: fc.constantFrom("ref", "eqref", "cref", "pageref"),
  }),
  fc.record({
    kind: fc.constant("citation" as const),
    key,
    command: fc.constantFrom("cite", "citep", "citet"),
  }),
);
const bibliography = fc.constantFrom("entries" as const, "named but missing" as const, "none" as const);

function written(tokenToWrite: Token): string {
  return tokenToWrite.kind === "label"
    ? `\\label{${tokenToWrite.key}}`
    : `\\${tokenToWrite.command}{${tokenToWrite.key}}`;
}

function unique(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

function repeated(
  keys: readonly string[],
  normalize: (keyToNormalize: string) => string = (same) => same,
): string[] {
  const firstByNormalized = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const each of keys) {
    const normalized = normalize(each);
    if (!firstByNormalized.has(normalized)) firstByNormalized.set(normalized, each);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...firstByNormalized]
    .filter(([normalized]) => (counts.get(normalized) ?? 0) > 1)
    .map(([, first]) => first);
}

const project = fc.record({
  mainTokens: fc.array(token, { maxLength: 6 }),
  partTokens: fc.array(token, { maxLength: 6 }),
  bibliography,
  entryKeys: fc.array(key, { maxLength: 4 }),
  unusedTexFiles: fc.uniqueArray(fc.constantFrom("unused.tex", "chapters/old.tex", "a.TEX"), {
    maxLength: 2,
  }),
});

describe("checkProjectReferences properties", () => {
  it("reports undefined, duplicate and unused keys across included files as set arithmetic says", async () => {
    await fc.assert(
      fc.asyncProperty(
        project,
        async ({ mainTokens, partTokens, bibliography: bib, entryKeys, unusedTexFiles }) => {
          const bibliographyCommand = bib === "none" ? "" : "\n\\bibliography{refs}";
          const files: Record<string, string> = {
            "main.tex": `\\input{part}\n${mainTokens.map(written).join("\n")}${bibliographyCommand}\n`,
            "part.tex": `${partTokens.map(written).join("\n")}\n`,
            ...Object.fromEntries(unusedTexFiles.map((path) => [path, "\\section{Old}\n"])),
          };
          if (bib === "entries")
            files["refs.bib"] = entryKeys
              .map((entryKey) => `@misc{${entryKey},\n  title = {x}\n}\n`)
              .join("");
          const report = await checkProjectReferences(inMemoryProject(files), "main.tex");

          const tokens = [...mainTokens, ...partTokens];
          const keysOf = (kind: Token["kind"]) =>
            tokens.filter((each) => each.kind === kind).map((each) => each.key);
          const labels = keysOf("label");
          const references = keysOf("reference");
          const citations = keysOf("citation");
          const entries = bib === "entries" ? entryKeys : [];

          expect(report.checkedFiles).toEqual(["main.tex", "part.tex"]);
          expect(report.texFilesNotIncluded).toEqual([...unusedTexFiles].sort());
          expect(report.undefinedReferences.map((undefinedKey) => undefinedKey.key)).toEqual(
            unique(references).filter((reference) => !labels.includes(reference) && reference !== "LastPage"),
          );
          expect(report.unusedLabels).toEqual(unique(labels).filter((label) => !references.includes(label)));
          expect(report.duplicateLabels.map((duplicate) => duplicate.key)).toEqual(repeated(labels));
          expect(report.duplicateBibliographyKeys.map((duplicate) => duplicate.key)).toEqual(
            repeated(entries, (entryKey) => entryKey.toLowerCase()),
          );
          expect(report.unusedBibliographyEntries).toEqual(
            unique(entries).filter((entry) => !citations.includes(entry)),
          );
          expect(report.undefinedCitations.map((undefinedKey) => undefinedKey.key)).toEqual(
            bib === "named but missing"
              ? []
              : unique(citations).filter((citation) => !entries.includes(citation)),
          );
          expect(report.citationsNotCheckedBecause !== undefined).toBe(bib === "named but missing");
          expect(report.missingFiles.map((missing) => missing.written)).toEqual(
            bib === "named but missing" ? ["\\bibliography{refs}"] : [],
          );
        },
      ),
    );
  });

  it("never throws on a project of arbitrary LaTeX, and reads only files the project has", async () => {
    await fc.assert(
      fc.asyncProperty(latexDocument, latexDocument, async (main, other) => {
        const reader = inMemoryProject({ "main.tex": `${main}\n\\input{other}`, "other.tex": other });
        const report = await checkProjectReferences(reader, "main.tex");
        expect(report.checkedFiles[0]).toBe("main.tex");
        for (const path of reader.reads) expect(reader.projectFiles.has(path)).toBe(true);
      }),
    );
  });
});
