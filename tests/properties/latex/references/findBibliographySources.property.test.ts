import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  findBibitems,
  findBibliographyResources,
} from "../../../../src/latex/references/findBibliographySources.js";
import { scanSource } from "../../../../src/latex/source/scannedSource.js";
import { keySpacing, prose, referenceKey } from "./referenceKeyArbitraries.js";

const bibliographyName = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9_\-/.]{1,10}$/),
  fc.constantFrom("refs.bib", "refs.BIB", "../shared/refs", "北京", "a b"),
);
const listItem = fc.oneof(
  { weight: 4, arbitrary: bibliographyName.map((name) => ({ written: name, fileName: name })) },
  {
    weight: 1,
    arbitrary: fc.constantFrom("", "#1", "\\jobname", "\\bibdir/refs").map((written) => ({ written })),
  },
);

function withBibExtension(name: string): string {
  return name.toLowerCase().endsWith(".bib") ? name : `${name}.bib`;
}

/** The commands after prose, with the line each one starts on. */
function placed(commands: readonly string[], proseLines: readonly string[]) {
  let text = "";
  const lines: number[] = [];
  commands.forEach((command, index) => {
    text += `${proseLines[index] ?? ""}\n`;
    lines.push(text.split("\n").length);
    text += `${command}\n`;
  });
  return { source: scanSource("main.tex", text), lines };
}

describe("findBibliographyResources properties", () => {
  it("reads every name a \\bibliography lists, adding .bib, skipping names built from macros", () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.tuple(listItem, keySpacing), { minLength: 1, maxLength: 4 }), { maxLength: 4 }),
        fc.array(prose, { maxLength: 4 }),
        (commands, proseLines) => {
          const written = commands.map(
            (items) =>
              `\\bibliography{${items.map(([item, spacing]) => `${spacing}${item.written}${spacing}`).join(",")}}`,
          );
          const { source, lines } = placed(written, proseLines);
          const expected = commands.flatMap((items, index) =>
            items.flatMap(([item]) =>
              "fileName" in item
                ? [
                    {
                      fileName: withBibExtension(item.fileName),
                      written: written[index],
                      location: { path: "main.tex", line: lines[index] },
                    },
                  ]
                : [],
            ),
          );
          expect(findBibliographyResources(source)).toEqual(expected);
        },
      ),
    );
  });

  it("reads each local file biblatex adds, as written, and leaves out remote and macro-built ones", () => {
    const resource = fc.record({
      command: fc.constantFrom("addbibresource", "addglobalbib", "addsectionbib"),
      options: fc.constantFrom("", "[label=x]", "[location=remote]", "[ location = remote ]"),
      file: fc.oneof(
        bibliographyName.map((name) => ({ written: name, local: true })),
        fc
          .constantFrom("https://x.org/refs.bib", "ftp://host/a.bib", "\\jobname.bib", " ")
          .map((written) => ({
            written,
            local: false,
          })),
      ),
    });
    fc.assert(
      fc.property(
        fc.array(resource, { maxLength: 4 }),
        fc.array(prose, { maxLength: 4 }),
        (resources, proseLines) => {
          const written = resources.map(
            ({ command, options, file }) => `\\${command}${options}{ ${file.written} }`,
          );
          const { source, lines } = placed(written, proseLines);
          const expected = resources.flatMap(({ options, file }, index) =>
            file.local && !options.includes("remote")
              ? [
                  {
                    fileName: file.written,
                    written: written[index],
                    location: { path: "main.tex", line: lines[index] },
                  },
                ]
              : [],
          );
          expect(findBibliographyResources(source)).toEqual(expected);
        },
      ),
    );
  });
});

describe("findBibitems properties", () => {
  it("reads the key of every \\bibitem, with or without a label, on its line", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom("", "[Smith 2020]", " [x] "), referenceKey, keySpacing), {
          maxLength: 5,
        }),
        fc.array(prose, { maxLength: 5 }),
        (items, proseLines) => {
          const written = items.map(
            ([label, key, spacing]) => `\\bibitem${label}{${spacing}${key}${spacing}}`,
          );
          const { source, lines } = placed(written, proseLines);
          expect(findBibitems(source)).toEqual(
            items.map(([, key], index) => ({
              key,
              command: "bibitem",
              location: { path: "main.tex", line: lines[index] },
            })),
          );
        },
      ),
    );
  });
});
