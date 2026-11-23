import { describe, expect, it } from "vitest";

import { findLabels, findReferences } from "../../../src/latex/references/findLabelsAndReferences.js";
import { scanSource } from "../../../src/latex/source/scannedSource.js";

function labelKeys(text: string): string[] {
  return findLabels(scanSource("main.tex", text)).map((label) => label.key);
}

function referenceKeys(text: string): string[] {
  return findReferences(scanSource("main.tex", text)).map((reference) => reference.key);
}

describe("findReferences", () => {
  it("reads the key after varioref's two optional arguments", () => {
    expect(referenceKeys("see \\vpageref[above][on the next page]{fig:plot}")).toEqual(["fig:plot"]);
  });
});

describe("findLabels", () => {
  it("reads a listing's label after a caption that holds brackets in braces", () => {
    expect(labelKeys("\\begin{lstlisting}[caption={[Short]Long caption}, label=lst:main]")).toEqual([
      "lst:main",
    ]);
  });

  it("reads a tcolorbox's label after a title that holds brackets in braces", () => {
    expect(labelKeys("\\begin{tcolorbox}[title={Note [1]}, label=box:note]")).toEqual(["box:note"]);
  });
});
