import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseEnvironmentFile } from "../../../src/config/loadEnvironmentFile.js";

const variableName = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,10}$/);
const valueCharacter = fc.constantFrom(
  "a",
  "Z",
  "0",
  " ",
  "\t",
  "=",
  "#",
  '"',
  "'",
  "$",
  "\\",
  "北",
  "😀",
  "/",
);
const anyValue = fc.string({ unit: valueCharacter, maxLength: 12 });
const bareValue = anyValue.filter(
  (value) =>
    value === value.trim() &&
    !(value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")),
);

interface WrittenAssignment {
  readonly name: string;
  readonly value: string;
  readonly line: string;
}

const spacing = fc.constantFrom("", " ", "  ", "\t");
const assignment: fc.Arbitrary<WrittenAssignment> = fc
  .record({
    name: variableName,
    exported: fc.boolean(),
    before: spacing,
    aroundEquals: fc.tuple(spacing, spacing),
    after: spacing,
    form: fc.oneof(
      bareValue.map((value) => ({ value, written: value })),
      anyValue.map((value) => ({ value, written: `"${value}"` })),
      anyValue.map((value) => ({ value, written: `'${value}'` })),
    ),
  })
  .map(({ name, exported, before, aroundEquals, after, form }) => ({
    name,
    value: form.value,
    line: `${before}${exported ? "export " : ""}${name}${aroundEquals[0]}=${aroundEquals[1]}${form.written}${after}`,
  }));

const lineThatAssignsNothing = fc.oneof(
  fc.constantFrom(
    "",
    "   ",
    "# OVERLEAF_GIT_TOKEN=secret",
    "  #X=1",
    "not an assignment",
    "1ABC=2",
    "=value",
  ),
  fc.string({ unit: valueCharacter, maxLength: 10 }).map((text) => `# ${text}`),
);

const environmentFile = fc
  .array(
    fc.oneof(
      assignment,
      lineThatAssignsNothing.map((line) => ({ line })),
    ),
    { maxLength: 8 },
  )
  .chain((lines) => fc.tuple(fc.constant(lines), fc.constantFrom("\n", "\r\n")));

function lastValueOfEachName(
  lines: ReadonlyArray<{ line: string } | WrittenAssignment>,
): Record<string, string> {
  const expected: Record<string, string> = {};
  for (const line of lines) if ("name" in line) expected[line.name] = line.value;
  return expected;
}

describe("parseEnvironmentFile properties", () => {
  it("reads back every assignment, bare or quoted, with the last one for a name winning", () => {
    fc.assert(
      fc.property(environmentFile, ([lines, lineBreak]) => {
        const text = lines.map((line) => line.line).join(lineBreak);
        expect(parseEnvironmentFile(text)).toEqual(lastValueOfEachName(lines));
      }),
    );
  });

  it("never throws, and reads only names a shell could export", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (text) => {
        for (const name of Object.keys(parseEnvironmentFile(text))) {
          expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
        }
      }),
    );
  });

  it("keeps a quoted value that holds a Unicode line or paragraph separator", () => {
    fc.assert(
      fc.property(variableName, fc.constantFrom("\u2028", "\u2029"), (name, separator) => {
        expect(parseEnvironmentFile(`${name}="x${separator}y"`)).toEqual({ [name]: `x${separator}y` });
      }),
    );
  });
});
