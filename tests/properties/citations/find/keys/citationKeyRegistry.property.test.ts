import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CitationKeyRegistry } from "../../../../../src/citations/find/keys/citationKeyRegistry.js";

const stem = fc.constantFrom("vaswani2017attention", "anon", "anon2015", "k", "smith2020", "x1", "x");
const takenKey = fc.oneof(
  stem,
  fc.tuple(stem, fc.stringMatching(/^(?:[a-z]|[0-9]{1,3})$/)).map(([chosen, suffix]) => `${chosen}${suffix}`),
  stem.map((chosen) => chosen.toUpperCase()),
);

describe("CitationKeyRegistry properties", () => {
  it("gives the stem when it is free and otherwise the stem and a suffix, never a key taken in any case", () => {
    fc.assert(
      fc.property(
        fc.array(takenKey, { maxLength: 40 }),
        fc.array(stem, { maxLength: 30 }),
        (taken, stems) => {
          const registry = new CitationKeyRegistry(taken);
          const used = new Set(taken.map((key) => key.toLowerCase()));
          for (const wanted of stems) {
            const key = registry.firstFreeKey(wanted);
            expect(used.has(key.toLowerCase())).toBe(false);
            expect(key.startsWith(wanted)).toBe(true);
            expect(/^(?:[b-z]|[0-9]+)?$/.test(key.slice(wanted.length))).toBe(true);
            if (!used.has(wanted.toLowerCase())) expect(key).toBe(wanted);
            registry.reserve(key);
            used.add(key.toLowerCase());
          }
        },
      ),
    );
  });
});
