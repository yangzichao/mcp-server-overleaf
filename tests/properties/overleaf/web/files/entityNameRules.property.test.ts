import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { checkEntityName } from "../../../../../src/overleaf/web/files/entityNameRules.js";
import { RequestNotSentError } from "../../../../../src/overleaf/web/overleafWebErrors.js";

/**
 * The rules the module's doc comment states, written as patterns rather than as its loop over
 * code units: no `/`, `\` or `*`, no control character, nothing outside the Basic Multilingual
 * Plane and no lone half of a pair; not `.` or `..` and no white space at either end; not
 * "prototype" or a name `Object.prototype` owns; and shorter than 150 code units.
 */
const BAD_CHARACTER = /[/\\*\p{Cc}\p{Cs}\u{10000}-\u{10FFFF}]/u;
const BAD_FILE = /^\.\.?$|^\s|\s$/;
const BLOCKED_NAMES = ["prototype", ...Object.getOwnPropertyNames(Object.prototype)];

function overleafAccepts(name: string): boolean {
  return (
    name.length > 0 &&
    name.length < 150 &&
    !BAD_CHARACTER.test(name) &&
    !BAD_FILE.test(name) &&
    !BLOCKED_NAMES.includes(name)
  );
}

const NAME_PIECES = [
  "main",
  ".tex",
  ".",
  "..",
  "figure 1",
  " ",
  "\t",
  "\n",
  " ",
  " ",
  "　",
  "﻿",
  "​",
  "᠎",
  "/",
  "\\",
  "*",
  "\u0000",
  "\u001f",
  "\u007f",
  "\u0080",
  "\u009f",
  "é",
  "论文",
  "𝔸",
  "😀",
  "\uD800",
  "\uDFFF",
  "prototype",
  "__proto__",
  "toString",
  "Prototype",
  "x".repeat(74),
];

const entityName = fc.oneof(
  {
    weight: 4,
    arbitrary: fc
      .array(fc.constantFrom(...NAME_PIECES), { minLength: 1, maxLength: 4 })
      .map((pieces) => pieces.join("")),
  },
  { weight: 1, arbitrary: fc.constantFrom("", ...BLOCKED_NAMES) },
  { weight: 1, arbitrary: fc.string({ unit: "binary", maxLength: 8 }) },
  { weight: 1, arbitrary: fc.integer({ min: 147, max: 151 }).map((length) => "a".repeat(length)) },
);

describe("checkEntityName properties", () => {
  it("accepts a name exactly when Overleaf's rules do, gives it back unchanged, and refuses only with RequestNotSentError", () => {
    fc.assert(
      fc.property(entityName, (name) => {
        if (overleafAccepts(name)) expect(checkEntityName(name)).toBe(name);
        else expect(() => checkEntityName(name)).toThrow(RequestNotSentError);
      }),
    );
  });
});
