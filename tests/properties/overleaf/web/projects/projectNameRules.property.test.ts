import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RequestNotSentError } from "../../../../../src/overleaf/web/overleafWebErrors.js";
import { checkProjectName } from "../../../../../src/overleaf/web/projects/projectNameRules.js";

/** White space trimmed one code unit at a time, as a check on `String.prototype.trim`. */
function trimWhiteSpace(name: string): string {
  let start = 0;
  let end = name.length;
  while (start < end && /\s/.test(name.charAt(start))) start += 1;
  while (end > start && /\s/.test(name.charAt(end - 1))) end -= 1;
  return name.slice(start, end);
}

/** `validateProjectName` after Overleaf trims: not blank, 150 code units at most, no `/` or `\`. */
function overleafAccepts(trimmed: string): boolean {
  return trimmed !== "" && trimmed.length <= 150 && !/[/\\]/.test(trimmed);
}

const NAME_PIECES = [
  "Thesis",
  "(Copy)",
  " ",
  "\t",
  "\n",
  " ",
  "　",
  "﻿",
  "​",
  "/",
  "\\",
  "é",
  "𝔸",
  "\uD800",
  "x".repeat(74),
];

const projectName = fc.oneof(
  fc.array(fc.constantFrom(...NAME_PIECES), { maxLength: 4 }).map((pieces) => pieces.join("")),
  fc.string({ unit: "binary", maxLength: 8 }),
  fc
    .tuple(fc.constantFrom("", " ", "　"), fc.integer({ min: 148, max: 152 }), fc.constantFrom("", " ", "\n"))
    .map(([before, length, after]) => `${before}${"a".repeat(length)}${after}`),
);

describe("checkProjectName properties", () => {
  it("accepts a name exactly when Overleaf would after trimming it, gives it back trimmed, and refuses only with RequestNotSentError", () => {
    fc.assert(
      fc.property(projectName, (name) => {
        const trimmed = trimWhiteSpace(name);
        if (overleafAccepts(trimmed)) expect(checkProjectName(name)).toBe(trimmed);
        else expect(() => checkProjectName(name)).toThrow(RequestNotSentError);
      }),
    );
  });

  it("gives back a name that passes again unchanged", () => {
    fc.assert(
      fc.property(projectName, (name) => {
        fc.pre(overleafAccepts(trimWhiteSpace(name)));
        const checked = checkProjectName(name);
        expect(checkProjectName(checked)).toBe(checked);
      }),
    );
  });
});
