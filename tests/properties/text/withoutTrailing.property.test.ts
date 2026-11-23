import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { withoutTrailing } from "../../../src/text/withoutTrailing.js";

/** The regular expression each call to withoutTrailing replaced, by the character it trims. */
function trailingRunPattern(character: "/" | "\n"): RegExp {
  return character === "/" ? /\/+$/ : /\n+$/;
}

describe("withoutTrailing properties", () => {
  it("removes exactly what the regular expression it replaces removed", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom("/", "\n", "a", " ") }),
        fc.constantFrom("/" as const, "\n" as const),
        (text, character) => {
          expect(withoutTrailing(text, character)).toBe(text.replace(trailingRunPattern(character), ""));
        },
      ),
    );
  });
});
