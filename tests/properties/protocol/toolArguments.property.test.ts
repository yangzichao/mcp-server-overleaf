import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type McpToolDescription, responseText } from "../../integration/support/mcpProtocol.js";
import { fuzzedArgumentPools } from "./support/fuzzedArgumentPools.js";
import { type FuzzedConfiguration, type FuzzedServer, startFuzzedServer } from "./support/fuzzedServer.js";
import { argumentValuesFromSchema, type JsonSchema } from "./support/jsonSchemaArbitrary.js";
import { describeStateChanges, snapshotProjectState } from "./support/projectStateSnapshot.js";
import { argumentToRepair, replyProblems } from "./support/replyProblems.js";
import {
  type ArgumentChoice,
  callArgumentsFor,
  TOOL_ARGUMENT_RECIPES,
} from "./support/toolArgumentRecipes.js";

/**
 * Every tool, called with arguments drawn from the schema it advertises, answers with a result
 * or a plain refusal: never a JavaScript error, an empty reply or a dead server. A tool marked
 * read-only changes nothing, and a write that fails leaves the project as it was.
 *
 * Reads run first, on the project as seeded; the writes after them change it as they go, the
 * suggestion and the comment first, before edits move the text they sit on. A third of the
 * runs send a random subset of a tool's arguments, and the rest send the set one action takes.
 * A refusal that names an argument as not applying, or as missing, is followed by another try
 * without it, or with it, so the calls also reach the work each action does.
 */

const TOOLS_IN_ORDER: Readonly<Record<FuzzedConfiguration, readonly string[]>> = {
  "git-and-cookie": [
    "list_projects",
    "read_project",
    "read_file",
    "search_project",
    "read_history",
    "check_references",
    "look_up_citations",
    "compile_project",
    "read_review",
    "manage_tracked_changes",
    "manage_comments",
    "edit_file",
    "manage_files",
    "push_changes",
    "manage_project",
  ],
  "cookie-only": [
    "list_projects",
    "read_project",
    "read_file",
    "search_project",
    "check_references",
    "look_up_citations",
    "compile_project",
    "read_review",
    "manage_tracked_changes",
    "manage_comments",
    "edit_file",
    "manage_files",
    "manage_project",
  ],
};

/**
 * A fifth of the global number of runs, since every run here is a round trip to the server and
 * two snapshots of the project. The cap keeps an exploring run, at 2000, to a few minutes.
 */
const RUNS_PER_TOOL = Math.min(50, Math.max(5, Math.round((fc.readConfigureGlobal().numRuns ?? 100) / 5)));
const TRIES_PER_RUN = 5;

async function checkOneCall(
  server: FuzzedServer,
  tool: McpToolDescription,
  callArguments: Record<string, unknown>,
): Promise<string> {
  const before = await snapshotProjectState(server.stateSources);
  const response = await server.client.callRaw(tool.name, callArguments);
  const after = await snapshotProjectState(server.stateSources);
  const problems = replyProblems(response);
  const changes = describeStateChanges(before, after);
  if (tool.annotations?.readOnlyHint === true && changes.length > 0) {
    problems.push(`It is marked read-only but changed the project:\n${changes.join("\n")}`);
  }
  if (tool.annotations?.readOnlyHint !== true && response.result?.isError === true && changes.length > 0) {
    problems.push(`It failed but changed the project:\n${changes.join("\n")}`);
  }
  const text = responseText(response);
  if (problems.length > 0) {
    throw new Error(
      `${tool.name} ${JSON.stringify(callArguments)}\n${problems.join("\n")}\nThe reply:\n${text.slice(0, 2000)}`,
    );
  }
  return text;
}

for (const configuration of Object.keys(TOOLS_IN_ORDER) as FuzzedConfiguration[]) {
  describe(`each tool on arguments its schema allows, with ${configuration}`, () => {
    let server: FuzzedServer;

    beforeAll(async () => {
      server = await startFuzzedServer(configuration);
    });

    afterAll(async () => {
      await server?.stop();
    });

    it("offers the tools this file calls", () => {
      expect(server.tools.map((tool) => tool.name).sort()).toEqual([...TOOLS_IN_ORDER[configuration]].sort());
    });

    it.each(TOOLS_IN_ORDER[configuration])(
      "%s answers every call properly",
      async (toolName) => {
        const tool = server.tools.find((candidate) => candidate.name === toolName);
        if (!tool) throw new Error(`The server does not offer ${toolName}.`);
        const schema = tool.inputSchema as JsonSchema;
        const required = schema.required ?? [];
        const optional = Object.keys(schema.properties ?? {}).filter((name) => !required.includes(name));
        const recipeCount = TOOL_ARGUMENT_RECIPES[toolName]?.length ?? 0;
        const argumentChoice: fc.Arbitrary<ArgumentChoice> = fc.record({
          recipeIndex:
            recipeCount === 0
              ? fc.constant(-1)
              : fc.oneof(
                  { arbitrary: fc.constant(-1), weight: 1 },
                  { arbitrary: fc.integer({ min: 0, max: recipeCount - 1 }), weight: 2 },
                ),
          optionalNames: fc.subarray(optional),
          mayUseMask: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
        });
        await fc.assert(
          fc.asyncProperty(
            argumentValuesFromSchema(schema, fuzzedArgumentPools(server.known)),
            argumentChoice,
            async (values, choice) => {
              const callArguments = callArgumentsFor(toolName, required, values, choice);
              for (let attempt = 0; attempt < TRIES_PER_RUN; attempt += 1) {
                const repair = argumentToRepair(await checkOneCall(server, tool, callArguments));
                if (repair?.kind === "drop" && repair.name in callArguments) {
                  delete callArguments[repair.name];
                } else if (
                  repair?.kind === "add" &&
                  repair.name in values &&
                  !(repair.name in callArguments)
                ) {
                  callArguments[repair.name] = values[repair.name];
                } else {
                  return;
                }
              }
            },
          ),
          { numRuns: RUNS_PER_TOOL },
        );
      },
      600_000,
    );
  });
}
