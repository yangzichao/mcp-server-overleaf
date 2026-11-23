import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as z from "zod/v4";

import { type RegisteredTool, registeredTools, resultText } from "./fakeToolRegistration.js";

/**
 * Every action and view of every tool, with each argument its "needs" message names added in
 * turn, as the server would after the schema accepts the call. A required argument must never
 * be one the dispatcher refuses as not applying, and every "needs" message names the action.
 */

const SELECTOR_FIELDS = ["action", "view", "where"];
const NEEDS_MESSAGE = /^(\w+) needs (.+)\.$/;
const PLACEHOLDERS: readonly unknown[] = ["x", 1, true, ["x"]];

type FieldSchema = z.ZodType & {
  readonly options?: readonly unknown[];
  readonly def?: { innerType?: FieldSchema };
};

function choices(schema: FieldSchema): readonly unknown[] {
  let inner: FieldSchema | undefined = schema;
  while (inner && inner.options === undefined) inner = inner.def?.innerType;
  return inner?.options ?? [];
}

/** A value the field's schema accepts, or undefined when none of the plain ones fits. */
function placeholderFor(schema: FieldSchema): unknown {
  return [...choices(schema), ...PLACEHOLDERS].find((candidate) => schema.safeParse(candidate).success);
}

interface SelectedOperation {
  readonly tool: RegisteredTool;
  readonly selector: string;
  readonly value: string;
}

function selectedOperations(tools: readonly RegisteredTool[]): SelectedOperation[] {
  return tools.flatMap((tool) => {
    const selector = SELECTOR_FIELDS.find((field) => field in tool.inputSchema.shape);
    if (selector === undefined) return [];
    const values = choices(tool.inputSchema.shape[selector] as FieldSchema);
    return values.map((value) => ({ tool, selector, value: String(value) }));
  });
}

/** The call with the selector and a placeholder for each field the schema cannot do without. */
function smallestAcceptedInput({ tool, selector, value }: SelectedOperation): Record<string, unknown> {
  const input: Record<string, unknown> = { [selector]: value };
  for (const [field, schema] of Object.entries(tool.inputSchema.shape)) {
    if (field !== selector && !(schema as FieldSchema).safeParse(undefined).success) {
      input[field] = placeholderFor(schema as FieldSchema);
    }
  }
  return input;
}

const OFFERED_GROUPS = [
  { gitBridgeToolsOffered: true, sessionCookieToolsOffered: true },
  { gitBridgeToolsOffered: false, sessionCookieToolsOffered: true },
];

describe("every registered tool's actions and views", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("No network in this test.")));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const offered of OFFERED_GROUPS) {
    const label = offered.gitBridgeToolsOffered ? "with a Git token" : "with only a session cookie";
    it(`accepts every argument a "needs" message asks for, and names the action in it, ${label}`, async () => {
      const operations = selectedOperations(registeredTools(offered));
      expect(operations.length).toBeGreaterThan(20);
      for (const operation of operations) {
        const { tool, value } = operation;
        const fields = Object.keys(tool.inputSchema.shape);
        let input = smallestAcceptedInput(operation);
        for (let step = 0; step <= fields.length; step += 1) {
          const text = resultText(await tool.handler(tool.inputSchema.parse(input)));
          expect(text, `${tool.name} ${value}`).not.toMatch(/does not apply to/);
          const needs = NEEDS_MESSAGE.exec(text);
          if (!needs) break;
          expect(needs[1], `${tool.name}: ${text}`).toBe(value);
          const asked = fields.filter(
            (field) => input[field] === undefined && new RegExp(`\\b${field}\\b`).test(needs[2] ?? ""),
          );
          expect(asked, `${tool.name}: ${text}`).not.toEqual([]);
          const [first = ""] = asked;
          input = { ...input, [first]: placeholderFor(tool.inputSchema.shape[first] as FieldSchema) };
        }
      }
    });
  }
});
