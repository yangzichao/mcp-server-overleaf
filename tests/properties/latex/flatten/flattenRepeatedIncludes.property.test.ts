import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  FlattenedDocumentTooLongError,
  flattenLatexDocument,
  MAXIMUM_FLATTENED_LENGTH,
} from "../../../../src/latex/flatten/flattenLatexDocument.js";
import { FLATTEN_TIME_BUDGET_MS } from "../../../latex/support/flattenTimeBudget.js";
import { inMemoryProject } from "../../../latex/support/inMemoryProject.js";
import { ROOT_PATH } from "./generatedLatexProject.js";

type FlatteningOutcome =
  | { readonly kind: "flattened"; readonly length: number }
  | { readonly kind: "refused"; readonly error: unknown };

interface TimedFlattening {
  readonly outcome: FlatteningOutcome;
  readonly milliseconds: number;
}

async function timeFlattening(files: Record<string, string>): Promise<TimedFlattening> {
  const started = performance.now();
  const outcome = await flattenLatexDocument(inMemoryProject(files), ROOT_PATH).then(
    (flattened): FlatteningOutcome => ({ kind: "flattened", length: flattened.text.length }),
    (error: unknown): FlatteningOutcome => ({ kind: "refused", error }),
  );
  return { outcome, milliseconds: performance.now() - started };
}

function expectFlattenedOrRefusedAtOnce({ outcome, milliseconds }: TimedFlattening): void {
  if (outcome.kind === "flattened") expect(outcome.length).toBeLessThanOrEqual(MAXIMUM_FLATTENED_LENGTH);
  else expect(outcome.error).toBeInstanceOf(FlattenedDocumentTooLongError);
  expect(milliseconds).toBeLessThan(FLATTEN_TIME_BUDGET_MS);
}

const INCLUDE_COMMANDS = ["input", "include", "subfile"] as const;

const includeChain = fc
  .record({
    repeats: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 3 }),
    command: fc.constantFrom(...INCLUDE_COMMANDS),
    leafLength: fc.oneof(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 1000, max: 200_000 })),
  })
  .map(({ repeats, command, leafLength }) => {
    const files: Record<string, string> = {};
    repeats.forEach((count, level) => {
      files[level === 0 ? ROOT_PATH : `part${level}.tex`] = `\\${command}{part${level + 1}}\n`.repeat(count);
    });
    files[`part${repeats.length}.tex`] = `${"x".repeat(leafLength - 1)}\n`;
    return files;
  });

const includesOnSeparateLines = fc
  .record({
    directive: fc.constantFrom(
      "\\input{b}",
      "\\include{b}",
      "\\subfile{b}",
      "\\input{missing}",
      "\\input{main}",
    ),
    lineEnd: fc.constantFrom("\n", "\r\n", "%\n", " % note\n"),
    count: fc.integer({ min: 1000, max: 40_000 }),
  })
  .map(({ directive, lineEnd, count }) => ({
    [ROOT_PATH]: `${directive}${lineEnd}`.repeat(count),
    "b.tex": "x\n",
  }));

const includesOnOneLine = fc
  .record({
    directive: fc.constantFrom("\\input{b}", "\\subfile{b}", "\\import{./}{b}"),
    between: fc.constantFrom("", " ", "\t", "x"),
    count: fc.integer({ min: 5000, max: 40_000 }),
    textAfter: fc.integer({ min: 500_000, max: 3_000_000 }),
  })
  .map(({ directive, between, count, textAfter }) => ({
    [ROOT_PATH]: `${`${directive}${between}`.repeat(count)}${"x".repeat(textAfter)}\n`,
    "b.tex": "x\n",
  }));

const littleOfItInlined = fc
  .record({
    form: fc.constantFrom("subfile", "endinput"),
    unusedLine: fc.constantFrom("\\usepackage{x}\n", "\\input{chapter}\n", "% \\input{chapter}\n"),
    unusedLength: fc.integer({ min: 10_000, max: 300_000 }),
    includes: fc.integer({ min: 200, max: 3000 }),
    throughMiddleFile: fc.boolean(),
  })
  .map(({ form, unusedLine, unusedLength, includes, throughMiddleFile }): Record<string, string> => {
    const unused = unusedLine.repeat(Math.ceil(unusedLength / unusedLine.length));
    const chapter =
      form === "subfile"
        ? `\\documentclass[main]{subfiles}\n${unused}\\begin{document}\nBody.\n\\end{document}\n`
        : `Body.\n\\endinput\n${unused}`;
    const directive = form === "subfile" ? "\\subfile{chapter}\n" : "\\input{chapter}\n";
    if (!throughMiddleFile) return { [ROOT_PATH]: directive.repeat(includes), "chapter.tex": chapter };
    const perFile = Math.ceil(Math.sqrt(includes));
    return {
      [ROOT_PATH]: "\\input{middle}\n".repeat(perFile),
      "middle.tex": directive.repeat(perFile),
      "chapter.tex": chapter,
    };
  });

describe("flattenLatexDocument on files included many times over", () => {
  it("flattens a chain of repeated includes, or refuses it for its length, at once", async () => {
    await fc.assert(
      fc.asyncProperty(includeChain, async (files) => {
        expectFlattenedOrRefusedAtOnce(await timeFlattening(files));
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });

  it("flattens a file of many includes on separate lines at once", async () => {
    await fc.assert(
      fc.asyncProperty(includesOnSeparateLines, async (files) => {
        expectFlattenedOrRefusedAtOnce(await timeFlattening(files));
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });

  it("flattens many includes on one long line at once", async () => {
    await fc.assert(
      fc.asyncProperty(includesOnOneLine, async (files) => {
        expectFlattenedOrRefusedAtOnce(await timeFlattening(files));
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });

  it("flattens a long file included many times at once when little of it is inlined", async () => {
    await fc.assert(
      fc.asyncProperty(littleOfItInlined, async (files) => {
        expectFlattenedOrRefusedAtOnce(await timeFlattening(files));
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});
