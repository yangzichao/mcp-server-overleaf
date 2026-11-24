import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { collectCitedRecords } from "../../../src/citations/collectCitedRecords.js";
import { inMemoryProject } from "../../latex/support/inMemoryProject.js";

const citationKey: fc.Arbitrary<string> = fc.constantFrom(
  "vaswani2017",
  "Vaswani2017",
  "lee:2021",
  "smith",
  "missing",
);
const citation = fc.tuple(
  fc.constantFrom("cite", "citep", "citet", "nocite"),
  fc.array(citationKey, { minLength: 1, maxLength: 3 }),
);

const document = fc.record({
  mainCitations: fc.array(citation, { maxLength: 4 }),
  includedCitations: fc.array(citation, { maxLength: 3 }),
  citesEveryEntry: fc.boolean(),
  entryKeys: fc.array(citationKey, { maxLength: 5 }),
  bibliographyCommand: fc.constantFrom("\\bibliography{refs}", "\\addbibresource{refs.bib}"),
});

function writtenCitations(citations: ReadonlyArray<readonly [string, readonly string[]]>): string {
  return citations.map(([command, keys]) => `\\${command}{${keys.join(",")}}`).join("\n");
}

describe("collectCitedRecords properties", () => {
  it("gives the cited entries in first-citation order, then the rest for \\nocite{*}, and the cited keys with no entry", async () => {
    await fc.assert(
      fc.asyncProperty(
        document,
        async ({ mainCitations, includedCitations, citesEveryEntry, entryKeys, bibliographyCommand }) => {
          const files = {
            "main.tex": [
              writtenCitations(mainCitations),
              "\\input{part}",
              citesEveryEntry ? "\\nocite{*}" : "",
              bibliographyCommand,
            ].join("\n"),
            "part.tex": writtenCitations(includedCitations),
            // Each entry's title is its position, so the first of two entries with one key can be told apart.
            "refs.bib": entryKeys.map((key, index) => `@misc{${key},\n  title = {${index}}\n}\n`).join("\n"),
          };
          const cited = await collectCitedRecords(inMemoryProject(files), "main.tex");

          const citedKeys = [
            ...new Set([...mainCitations, ...includedCitations].flatMap(([, keys]) => keys)),
          ];
          const firstEntryIndexByKey = new Map<string, number>();
          entryKeys.forEach((key, index) => {
            if (!firstEntryIndexByKey.has(key)) firstEntryIndexByKey.set(key, index);
          });
          const expectedKeys = [
            ...citedKeys.filter((key) => firstEntryIndexByKey.has(key)),
            ...(citesEveryEntry
              ? [...firstEntryIndexByKey.keys()].filter((key) => !citedKeys.includes(key))
              : []),
          ];

          expect(cited.bibliographyFiles).toEqual(["refs.bib"]);
          expect(cited.citesEveryEntry).toBe(citesEveryEntry);
          expect(cited.records.map((record) => [record.key, record.fields.get("title")])).toEqual(
            expectedKeys.map((key) => [key, String(firstEntryIndexByKey.get(key))]),
          );
          expect(cited.allRecords.map((record) => record.key)).toEqual([...firstEntryIndexByKey.keys()]);
          expect(cited.keysWithoutEntries).toEqual(citedKeys.filter((key) => !firstEntryIndexByKey.has(key)));
        },
      ),
    );
  });
});
