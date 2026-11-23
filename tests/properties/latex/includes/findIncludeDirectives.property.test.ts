import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  describeIncludeDirective,
  findIncludeDirectives,
} from "../../../../src/latex/includes/findIncludeDirectives.js";
import { scanSource } from "../../../../src/latex/source/scannedSource.js";

type WrittenInclude =
  | { readonly kind: "simple"; readonly command: string; readonly fileName: string }
  | {
      readonly kind: "import";
      readonly command: string;
      readonly importDirectory: string;
      readonly fileName: string;
    };

const writtenName = fc.stringMatching(/^[A-Za-z0-9_./ -]{1,12}$/).filter((name) => name.trim() !== "");
const macroName = fc.constantFrom("\\chapterdir/intro", "#1", "\\jobname");

const simpleInclude: fc.Arbitrary<WrittenInclude> = fc.record({
  kind: fc.constant("simple" as const),
  command: fc.constantFrom("input", "include", "subfile"),
  fileName: writtenName,
});
const importInclude: fc.Arbitrary<WrittenInclude> = fc.record({
  kind: fc.constant("import" as const),
  command: fc.constantFrom(
    "import",
    "subimport",
    "inputfrom",
    "subinputfrom",
    "includefrom",
    "subincludefrom",
  ),
  importDirectory: writtenName,
  fileName: writtenName,
});
function render(include: WrittenInclude): string {
  return include.kind === "simple"
    ? `\\${include.command}{${include.fileName}}`
    : `\\${include.command}{${include.importDirectory}}{${include.fileName}}`;
}

/** Text between directives that holds no backslash or brace, so it cannot look like a command. */
const filler = fc.stringMatching(/^[A-Za-z0-9 ,.;\n]{0,10}$/);

describe("findIncludeDirectives properties", () => {
  it("reads back every directive written, in order, with its name trimmed as written", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(filler, fc.oneof(simpleInclude, importInclude)), { maxLength: 8 }),
        filler,
        (pieces, trailingFiller) => {
          const text = pieces.map(([before, include]) => before + render(include)).join("") + trailingFiller;
          const { directives, pathsBuiltFromMacros } = findIncludeDirectives(scanSource("main.tex", text));
          expect(pathsBuiltFromMacros).toBe(0);
          expect(directives.map((directive) => [directive.command, directive.fileName])).toEqual(
            pieces.map(([, include]) => [include.command, include.fileName.trim()]),
          );
          for (const directive of directives) {
            expect(text.startsWith(`\\${directive.command}`, directive.index)).toBe(true);
          }
        },
      ),
    );
  });

  it("describes each directive the way it would be written once its names are trimmed", () => {
    fc.assert(
      fc.property(fc.oneof(simpleInclude, importInclude), (include) => {
        const [directive] = findIncludeDirectives(scanSource("main.tex", render(include))).directives;
        const trimmed =
          include.kind === "simple"
            ? { ...include, fileName: include.fileName.trim() }
            : {
                ...include,
                fileName: include.fileName.trim(),
                importDirectory: include.importDirectory.trim(),
              };
        expect(directive && describeIncludeDirective(directive)).toBe(render(trimmed));
      }),
    );
  });

  it("counts a path built from a macro instead of returning it", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("input", "include", "subfile"),
        macroName,
        filler,
        (command, name, before) => {
          const scan = findIncludeDirectives(scanSource("main.tex", `${before}\\${command}{${name}}`));
          expect(scan).toEqual({ directives: [], pathsBuiltFromMacros: 1 });
        },
      ),
    );
  });
});
