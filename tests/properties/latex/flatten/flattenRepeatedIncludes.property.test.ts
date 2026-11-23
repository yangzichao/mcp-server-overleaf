import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  FlattenedDocumentTooLongError,
  flattenLatexDocument,
  MAXIMUM_FLATTENED_LENGTH,
} from "../../../../src/latex/flatten/flattenLatexDocument.js";
import { inMemoryProject } from "../../../latex/support/inMemoryProject.js";
import { ROOT_PATH } from "./generatedLatexProject.js";

interface TimedFlattening {
  /** The flattened text's length, or what flattening threw. */
  readonly outcome: unknown;
  readonly milliseconds: number;
}

async function timeFlattening(files: Record<string, string>): Promise<TimedFlattening> {
  const started = performance.now();
  const outcome = await flattenLatexDocument(inMemoryProject(files), ROOT_PATH).then(
    (flattened) => flattened.text.length,
    (error: unknown) => error,
  );
  return { outcome, milliseconds: performance.now() - started };
}

/** Within the length limit, or refused for passing it, and at once. */
function expectFlattenedOrRefusedAtOnce({ outcome, milliseconds }: TimedFlattening): void {
  if (typeof outcome === "number") expect(outcome).toBeLessThanOrEqual(MAXIMUM_FLATTENED_LENGTH);
  else expect(outcome).toBeInstanceOf(FlattenedDocumentTooLongError);
  expect(milliseconds).toBeLessThan(1000);
}

const INCLUDE_COMMANDS = ["input", "include", "subfile"] as const;

/** Files that each include the next many times; the last one holds plain text. */
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

describe("flattenLatexDocument on files included many times over", () => {
  // A main file with 60 copies of \input{chapter}, a chapter with 90 copies of \input{table} and
  // a table of 100,000 characters once threw RangeError after 7 seconds, because the length was
  // checked only once each included file was built, and main's text passed what a string holds.
  it("flattens a chain of repeated includes, or refuses it for its length, at once", async () => {
    await fc.assert(
      fc.asyncProperty(includeChain, async (files) => {
        expectFlattenedOrRefusedAtOnce(await timeFlattening(files));
      }),
      { numRuns: 40, endOnFailure: true },
    );
  });
});
