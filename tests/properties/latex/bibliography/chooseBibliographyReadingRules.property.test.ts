import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  BIBER_READING_RULES,
  BIBTEX_READING_RULES,
} from "../../../../src/latex/bibliography/bibliographyReadingRules.js";
import { chooseBibliographyReadingRules } from "../../../../src/latex/bibliography/chooseBibliographyReadingRules.js";
import { scanSource } from "../../../../src/latex/source/scannedSource.js";

interface WrittenLoading {
  readonly written: string;
  readonly loadsBiblatex: boolean;
  readonly withBibtexBackend: boolean;
}

const backendOption = fc.oneof(
  fc
    .constantFrom("backend=bibtex", "backend = bibtex8", "backend=bibtexu")
    .map((option) => ({ option, bibtex: true })),
  fc
    .constantFrom("backend=biber", "backend=bibtex9", "style=apa", "natbib=true")
    .map((option) => ({ option, bibtex: false })),
);
const packageLoading: fc.Arbitrary<WrittenLoading> = fc
  .record({
    command: fc.constantFrom("usepackage", "RequirePackage"),
    packages: fc.uniqueArray(
      fc.constantFrom("biblatex", "natbib", "graphicx", "biblatex-chicago", "csquotes"),
      {
        minLength: 1,
        maxLength: 3,
      },
    ),
    options: fc.array(backendOption, { maxLength: 2 }),
    spacing: fc.constantFrom("", " ", "  "),
  })
  .map(({ command, packages, options, spacing }) => {
    const optionList = options.length === 0 ? "" : `[${options.map((entry) => entry.option).join(",")}]`;
    const loadsBiblatex = packages.includes("biblatex");
    return {
      written: `\\${command}${optionList}${spacing}{${packages.join(`,${spacing}`)}}`,
      loadsBiblatex,
      withBibtexBackend: loadsBiblatex && options.some((entry) => entry.bibtex),
    };
  });
const resourceCommand: fc.Arbitrary<WrittenLoading> = fc
  .constantFrom("\\addbibresource{refs.bib}", "\\addglobalbib{a.bib}", "\\addsectionbib{b.bib}")
  .map((written) => ({ written, loadsBiblatex: true, withBibtexBackend: false }));
const unrelated: fc.Arbitrary<WrittenLoading> = fc
  .constantFrom(
    "\\bibliography{refs}",
    "\\addbibresources{x}",
    "Text.",
    "\\usepackage{natbib}",
    "\\bibliographystyle{plain}",
  )
  .map((written) => ({ written, loadsBiblatex: false, withBibtexBackend: false }));

const visitedFiles = fc.array(
  fc.array(fc.oneof(packageLoading, resourceCommand, unrelated), { maxLength: 4 }),
  {
    minLength: 1,
    maxLength: 3,
  },
);

describe("chooseBibliographyReadingRules properties", () => {
  it("reads as biber does exactly when a file loads biblatex and no biblatex loading asks for a BibTeX backend", () => {
    fc.assert(
      fc.property(visitedFiles, (files) => {
        const visited = files.map((lines, index) =>
          scanSource(`file${index}.tex`, lines.map((line) => line.written).join("\n")),
        );
        const loadings = files.flat();
        const readsAsBiber =
          loadings.some((loading) => loading.loadsBiblatex) &&
          !loadings.some((loading) => loading.withBibtexBackend);
        expect(chooseBibliographyReadingRules(visited)).toBe(
          readsAsBiber ? BIBER_READING_RULES : BIBTEX_READING_RULES,
        );
      }),
    );
  });
});
