import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { BibliographyMacros } from "../../../../src/latex/bibliography/bibliographyMacros.js";
import type { BibliographyReadingRules } from "../../../../src/latex/bibliography/bibliographyReadingRules.js";
import { anyReadingRules } from "../../support/bibliographyArbitraries.js";

const macroName = fc.constantFrom("acl", "ACL", "Acl", "jan", "JAN", "dec", "ieee", "IEEE", "x", "北京");
const operation = fc.oneof(
  fc.record({ kind: fc.constant("define" as const), name: macroName, value: fc.string({ maxLength: 5 }) }),
  fc.record({
    kind: fc.constant("expand" as const),
    name: macroName,
    definitionBeingRead: fc.option(macroName, { nil: undefined }),
  }),
);

function expectedExpansion(
  rules: BibliographyReadingRules,
  model: ReadonlyMap<string, string>,
  name: string,
  definitionBeingRead: string | undefined,
): string {
  const lowerCaseName = name.toLowerCase();
  if (lowerCaseName === definitionBeingRead?.toLowerCase()) return "";
  return model.get(lowerCaseName) ?? (rules.undefinedMacro === "stays as written" ? name : "");
}

describe("BibliographyMacros properties", () => {
  it("expands a name to its latest definition in any case, the program's own, or what an undefined one becomes", () => {
    fc.assert(
      fc.property(anyReadingRules, fc.array(operation, { maxLength: 12 }), (rules, operations) => {
        const macros = new BibliographyMacros(rules);
        const model = new Map(rules.predefinedMacros);
        for (const step of operations) {
          if (step.kind === "define") {
            macros.define(step.name, step.value);
            model.set(step.name.toLowerCase(), step.value);
            continue;
          }
          expect(macros.expand(step.name, step.definitionBeingRead)).toBe(
            expectedExpansion(rules, model, step.name, step.definitionBeingRead),
          );
        }
      }),
    );
  });

  it("never changes the program's predefined macros for another table", () => {
    fc.assert(
      fc.property(anyReadingRules, fc.array(operation, { maxLength: 6 }), (rules, operations) => {
        const before = new Map(rules.predefinedMacros);
        const macros = new BibliographyMacros(rules);
        for (const step of operations) if (step.kind === "define") macros.define(step.name, step.value);
        expect(new Map(rules.predefinedMacros)).toEqual(before);
        const fresh = new BibliographyMacros(rules);
        for (const [name, value] of before) expect(fresh.expand(name)).toBe(value);
      }),
    );
  });
});
