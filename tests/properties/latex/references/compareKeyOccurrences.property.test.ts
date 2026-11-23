import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  findDuplicateDefinitions,
  findUndefinedUses,
  findUnusedDefinitions,
} from "../../../../src/latex/references/compareKeyOccurrences.js";
import type { KeyOccurrence } from "../../../../src/latex/references/keyOccurrence.js";

const key = fc.constantFrom("fig:a", "Fig:A", "fig:b", "eq:1", "smith2020", "Smith2020", "北京", "𝔸");
const occurrence: fc.Arbitrary<KeyOccurrence> = fc.record({
  key,
  command: fc.constantFrom("ref", "cref", "label", "cite"),
  location: fc.record({
    path: fc.constantFrom("main.tex", "intro.tex"),
    line: fc.integer({ min: 1, max: 99 }),
  }),
});
const occurrences = fc.array(occurrence, { maxLength: 12 });

function distinctInOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

describe("findUndefinedUses properties", () => {
  it("reports each used key that is not defined exactly once, in order of first use, with all its locations", () => {
    fc.assert(
      fc.property(occurrences, fc.uniqueArray(key), (uses, defined) => {
        const definedKeys = new Set<string>(defined);
        const undefinedUses = findUndefinedUses(uses, definedKeys);
        const expectedKeys = distinctInOrder(uses.map((use) => use.key)).filter(
          (used) => !definedKeys.has(used),
        );
        expect(undefinedUses.map((undefinedUse) => undefinedUse.key)).toEqual(expectedKeys);
        for (const undefinedUse of undefinedUses) {
          expect(undefinedUse.locations).toEqual(
            uses.filter((use) => use.key === undefinedUse.key).map((use) => use.location),
          );
        }
      }),
    );
  });

  it("names a defined key that differs only in case, and never one that matches exactly", () => {
    fc.assert(
      fc.property(occurrences, fc.uniqueArray(key), (uses, defined) => {
        for (const undefinedUse of findUndefinedUses(uses, new Set<string>(defined))) {
          const caseVariant = undefinedUse.differsOnlyInCaseFrom;
          const anyVariantDefined = defined.some(
            (candidate) => candidate.toLowerCase() === undefinedUse.key.toLowerCase(),
          );
          expect(caseVariant !== undefined).toBe(anyVariantDefined);
          if (caseVariant !== undefined) {
            expect(caseVariant.toLowerCase()).toBe(undefinedUse.key.toLowerCase());
            expect(caseVariant).not.toBe(undefinedUse.key);
          }
        }
      }),
    );
  });
});

describe("findUnusedDefinitions properties", () => {
  it("lists each defined key no use names, once, in order of definition", () => {
    fc.assert(
      fc.property(occurrences, fc.uniqueArray(key), (definitions, used) => {
        const usedKeys = new Set<string>(used);
        expect(findUnusedDefinitions(definitions, usedKeys)).toEqual(
          distinctInOrder(definitions.map((definition) => definition.key)).filter(
            (defined) => !usedKeys.has(defined),
          ),
        );
      }),
    );
  });
});

describe("findDuplicateDefinitions properties", () => {
  it("reports exactly the keys defined more than once, with every location", () => {
    fc.assert(
      fc.property(occurrences, (definitions) => {
        const duplicates = findDuplicateDefinitions(definitions);
        const expectedKeys = distinctInOrder(definitions.map((definition) => definition.key)).filter(
          (defined) => definitions.filter((definition) => definition.key === defined).length > 1,
        );
        expect(duplicates.map((duplicate) => duplicate.key)).toEqual(expectedKeys);
        for (const duplicate of duplicates) {
          expect(duplicate.locations).toEqual(
            definitions
              .filter((definition) => definition.key === duplicate.key)
              .map((definition) => definition.location),
          );
        }
      }),
    );
  });

  it("finds at least as many duplicates when keys are compared without case", () => {
    fc.assert(
      fc.property(occurrences, (definitions) => {
        const caseSensitive = findDuplicateDefinitions(definitions);
        const caseInsensitive = findDuplicateDefinitions(definitions, (defined) => defined.toLowerCase());
        const reportedOccurrences = (duplicates: typeof caseSensitive) =>
          duplicates.reduce((total, duplicate) => total + duplicate.locations.length, 0);
        expect(reportedOccurrences(caseInsensitive)).toBeGreaterThanOrEqual(
          reportedOccurrences(caseSensitive),
        );
      }),
    );
  });
});
