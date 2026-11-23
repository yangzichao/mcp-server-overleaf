import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { withoutTrailing } from "../../../src/text/withoutTrailing.js";

const TRAILING_RUN_PATTERNS: Record<string, RegExp> = { "/": /\/+$/, "\n": /\n+$/ };

describe("withoutTrailing properties", () => {
  it("removes exactly what the regular expression it replaces removed", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom("/", "\n", "a", " ") }),
        fc.constantFrom("/", "\n"),
        (text, character) => {
          expect(withoutTrailing(text, character)).toBe(
            text.replace(TRAILING_RUN_PATTERNS[character] ?? /$^/, ""),
          );
        },
      ),
    );
  });
});
