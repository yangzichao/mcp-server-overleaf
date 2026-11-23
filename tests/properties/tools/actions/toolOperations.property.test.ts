import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  requireArgument,
  runSelectedOperation,
  type ToolOperation,
} from "../../../../src/tools/actions/toolOperations.js";
import { textResult } from "../../../../src/tools/toolContext.js";

type GeneratedInput = Record<string, string | undefined>;

const ARGUMENT_NAMES = ["path", "toPath", "content", "findText", "message", "project", "action"];

const operationTable = fc
  .uniqueArray(fc.constantFrom("read", "write", "move", "delete", "list", "add"), {
    minLength: 1,
    maxLength: 5,
  })
  .chain((names) =>
    fc
      .record({
        uses: fc.tuple(...names.map(() => fc.subarray(ARGUMENT_NAMES))),
        shared: fc.subarray(ARGUMENT_NAMES),
        selected: fc.constantFrom(...names),
        input: fc.dictionary(
          fc.constantFrom(...ARGUMENT_NAMES),
          fc.option(fc.constantFrom("x", ""), { nil: undefined }),
        ),
      })
      .map((parts) => ({ names, ...parts })),
  );

/** "a", "a and b", "a, b and c". */
function listed(items: readonly string[]): string {
  return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

describe("runSelectedOperation properties", () => {
  it("runs the selected operation alone, or refuses the first argument it does not read and names who does", async () => {
    await fc.assert(
      fc.asyncProperty(operationTable, async ({ names, uses, shared, selected, input }) => {
        const ran: string[] = [];
        const operations: Record<string, ToolOperation<GeneratedInput>> = Object.fromEntries(
          names.map((name, index) => [
            name,
            {
              uses: uses[index] ?? [],
              run: async (received: GeneratedInput) => {
                expect(received).toBe(input);
                ran.push(name);
                return textResult(name);
              },
            },
          ]),
        );
        const selectedUses = operations[selected]?.uses ?? [];
        const refused = Object.entries(input).find(
          ([name, value]) => value !== undefined && !shared.includes(name) && !selectedUses.includes(name),
        )?.[0];
        // It refuses before it returns a promise; every tool calls it inside runToolSafely's then.
        const outcome = Promise.resolve().then(() =>
          runSelectedOperation<string, GeneratedInput>(selected, operations, input, shared),
        );
        if (refused === undefined) {
          await expect(outcome).resolves.toEqual(textResult(selected));
          expect(ran).toEqual([selected]);
          return;
        }
        const users = names.filter((name) => operations[name]?.uses.includes(refused));
        const usedBy =
          users.length === 0 ? "" : `; ${listed(users)} ${users.length === 1 ? "uses" : "use"} it`;
        await expect(outcome).rejects.toThrow(`${refused} does not apply to ${selected}${usedBy}.`);
        expect(ran).toEqual([]);
      }),
    );
  });
});

describe("requireArgument properties", () => {
  it("passes on any value given, falsy ones included, and names the argument and operation of one left out", () => {
    const given = fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null));
    fc.assert(
      fc.property(
        given,
        fc.constantFrom(...ARGUMENT_NAMES),
        fc.constantFrom("write", "move"),
        (value, name, operation) => {
          expect(requireArgument(value, name, operation)).toBe(value);
          expect(() => requireArgument(undefined, name, operation)).toThrow(`${operation} needs ${name}.`);
        },
      ),
    );
  });
});
