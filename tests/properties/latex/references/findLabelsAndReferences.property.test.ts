import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { findLabels, findReferences } from "../../../../src/latex/references/findLabelsAndReferences.js";
import { scanSource } from "../../../../src/latex/source/scannedSource.js";
import { prose, referenceKey } from "./referenceKeyArbitraries.js";

const writtenReference = fc.oneof(
  fc.record({
    command: fc.constantFrom("ref", "eqref", "pageref", "autoref", "nameref", "vref", "zref"),
    keys: referenceKey.map((key) => [key]),
  }),
  fc.record({
    command: fc.constantFrom("cref", "Cref", "cpageref", "labelcref", "zcref"),
    keys: fc.array(referenceKey, { minLength: 1, maxLength: 4 }),
  }),
);

describe("findLabels properties", () => {
  it("reads back every \\label and \\zlabel written, in order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(prose, fc.constantFrom("label", "zlabel"), referenceKey), { maxLength: 6 }),
        (pieces) => {
          const text = pieces.map(([before, command, key]) => `${before}\\${command}{${key}}`).join("");
          expect(findLabels(scanSource("main.tex", text)).map((label) => [label.command, label.key])).toEqual(
            pieces.map(([, command, key]) => [command, key]),
          );
        },
      ),
    );
  });
});

describe("findReferences properties", () => {
  it("reads back every key of every reference written, in order", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(prose, writtenReference), { maxLength: 6 }), (pieces) => {
        const text = pieces
          .map(([before, reference]) => `${before}\\${reference.command}{${reference.keys.join(",")}}`)
          .join("");
        expect(findReferences(scanSource("main.tex", text)).map((reference) => reference.key)).toEqual(
          pieces.flatMap(([, reference]) => reference.keys),
        );
      }),
    );
  });

  it("reads both ends of a cleveref range", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("crefrange", "Crefrange"),
        referenceKey,
        referenceKey,
        (command, first, last) => {
          const references = findReferences(scanSource("main.tex", `\\${command}{${first}}{${last}}`));
          expect(references.map((reference) => reference.key)).toEqual([first, last]);
        },
      ),
    );
  });

  it("never reads a longer command that merely starts like a reference command", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ref", "cref", "eqref"),
        fc.stringMatching(/^[A-Za-z]{1,4}$/),
        referenceKey,
        (command, suffix, key) => {
          const references = findReferences(scanSource("main.tex", `\\${command}${suffix}{${key}}`));
          expect(references.filter((reference) => reference.command === command)).toEqual([]);
        },
      ),
    );
  });
});
