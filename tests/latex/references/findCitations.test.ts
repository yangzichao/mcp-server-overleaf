import { describe, expect, it } from "vitest";

import { findCitations } from "../../../src/latex/references/findCitations.js";
import { scanSource } from "../../../src/latex/source/scannedSource.js";

function citedKeys(text: string): string[][] {
  return findCitations(scanSource("main.tex", text)).citations.map((citation) => [
    citation.command,
    citation.key,
  ]);
}

describe("findCitations", () => {
  it("reads natbib's capitalised commands, which start a sentence with a von name", () => {
    expect(citedKeys("\\Citet{vonneumann} and \\Citep[p.~2]{deboor}. \\Citeauthor{vanhove}")).toEqual([
      ["Citet", "vonneumann"],
      ["Citep", "deboor"],
      ["Citeauthor", "vanhove"],
    ]);
  });

  it("reads every group of biblatex's capitalised multicite command", () => {
    expect(citedKeys("\\Cites[see][]{first}[p.~2]{second}")).toEqual([
      ["Cites", "first"],
      ["Cites", "second"],
    ]);
  });

  it("does not read a command that defines citation commands as a citation", () => {
    expect(citedKeys("\\DeclareAutoCiteCommand{footnote}{\\footcite}{\\footcites}")).toEqual([]);
  });
});
