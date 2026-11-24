import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findCitations } from "../../../../src/latex/references/findCitations.js";
import { scanSource } from "../../../../src/latex/source/scannedSource.js";
import { keySpacing, prose, referenceKey } from "./referenceKeyArbitraries.js";

const citationCommand = fc.constantFrom(
  "cite",
  "citep",
  "citet",
  "Citet",
  "Citep",
  "Cite",
  "parencite",
  "Parencite",
  "textcite",
  "footcite",
  "nocite",
);
const optionalArguments = fc.constantFrom("", "[p.~2]", "[see][]", " [e.g.] [ch.~3]");

interface WrittenCitation {
  readonly command: string;
  readonly starred: boolean;
  readonly options: string;
  readonly keys: string[];
  readonly spacing: string;
}

const writtenCitation: fc.Arbitrary<WrittenCitation> = fc.record({
  command: citationCommand,
  starred: fc.boolean(),
  options: optionalArguments,
  keys: fc.array(referenceKey, { minLength: 1, maxLength: 4 }),
  spacing: keySpacing,
});

function render(citation: WrittenCitation): string {
  const keys = citation.keys.map((key) => `${citation.spacing}${key}${citation.spacing}`).join(",");
  return `\\${citation.command}${citation.starred ? "*" : ""}${citation.options}{${keys}}`;
}

describe("findCitations properties", () => {
  it("reads back every key of every citation written, in order, with its command", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(prose, writtenCitation), { maxLength: 6 }), (pieces) => {
        const text = pieces.map(([before, citation]) => before + render(citation)).join("");
        const scan = findCitations(scanSource("main.tex", text));
        expect(scan.citesEveryEntry).toBe(false);
        expect(scan.citations.map((citation) => [citation.command, citation.key])).toEqual(
          pieces.flatMap(([, citation]) => citation.keys.map((key) => [citation.command, key])),
        );
      }),
    );
  });

  it("places each citation on the line its command starts on", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(prose, writtenCitation), { maxLength: 6 }), (pieces) => {
        let text = "";
        const expectedLines: number[] = [];
        for (const [before, citation] of pieces) {
          text += before;
          const line = text.split("\n").length;
          text += render(citation);
          for (const _key of citation.keys) expectedLines.push(line);
        }
        const scan = findCitations(scanSource("main.tex", text));
        expect(scan.citations.map((citation) => citation.location.line)).toEqual(expectedLines);
      }),
    );
  });

  it("reads \\nocite{*} as citing every entry, wherever it sits among other keys", () => {
    fc.assert(
      fc.property(
        fc.array(referenceKey, { maxLength: 3 }),
        fc.array(referenceKey, { maxLength: 3 }),
        (before, after) => {
          const scan = findCitations(
            scanSource("main.tex", `\\nocite{${[...before, "*", ...after].join(",")}}`),
          );
          expect(scan.citesEveryEntry).toBe(true);
          expect(scan.citations.map((citation) => citation.key)).toEqual([...before, ...after]);
        },
      ),
    );
  });

  it("reads every bracket-and-key group of a multicite command", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("cites", "Cites", "parencites", "textcites"),
        fc.array(fc.tuple(optionalArguments, referenceKey), { minLength: 1, maxLength: 4 }),
        (command, groups) => {
          const text = `\\${command}${groups.map(([options, key]) => `${options}{${key}}`).join("")}`;
          const scan = findCitations(scanSource("main.tex", text));
          expect(scan.citations.map((citation) => [citation.command, citation.key])).toEqual(
            groups.map(([, key]) => [command, key]),
          );
        },
      ),
    );
  });
});
