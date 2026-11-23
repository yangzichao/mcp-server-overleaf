import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { expectInstructionsToNameOnlyWhatIsListed } from "../../integration/support/instructionNames.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

// An absolute path: loadFeature resolves a relative one against the transformed module.
const feature = await loadFeature(
  fileURLToPath(new URL("toolsOfferedByCredentials.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

type ToolTable = ReadonlyArray<{ tool: string }>;
type ChoiceTable = ReadonlyArray<{ tool: string; choice: string }>;

/** The arguments that pick what a tool does; each offers only the choices the credentials can serve. */
const CHOICE_ARGUMENTS = ["action", "view", "where"];

async function offeredToolNames(): Promise<string[]> {
  return await scenario.world.client.listToolNames();
}

async function offeredChoicesOf(toolName: string): Promise<string[]> {
  const tool = (await scenario.world.client.listTools()).find((candidate) => candidate.name === toolName);
  return CHOICE_ARGUMENTS.flatMap((argumentName) => {
    const property = tool?.inputSchema.properties?.[argumentName] as { enum?: string[] } | undefined;
    return property?.enum ?? [];
  });
}

function serverInstructions(): string {
  return scenario.world.client.serverInstructions ?? "";
}

describeFeature(feature, ({ Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Then, And, But } = steps;

    for (const keyword of [Then, And, But]) {
      keyword("these tools are offered:", async (_context, table: ToolTable) => {
        expect(await offeredToolNames()).toEqual(expect.arrayContaining(table.map((row) => row.tool)));
      });

      keyword("none of these tools are offered:", async (_context, table: ToolTable) => {
        const offered = await offeredToolNames();
        for (const { tool } of table) expect(offered, `${tool} is offered`).not.toContain(tool);
      });

      keyword("these choices are offered:", async (_context, table: ChoiceTable) => {
        for (const { tool, choice } of table) {
          expect(await offeredChoicesOf(tool), `${tool} offers ${choice}`).toContain(choice);
        }
      });

      keyword("none of these choices are offered:", async (_context, table: ChoiceTable) => {
        for (const { tool, choice } of table) {
          expect(await offeredChoicesOf(tool), `${tool} offers ${choice}`).not.toContain(choice);
        }
      });
    }

    Then("{int} tools are offered", async (_context, count: number) => {
      expect(await offeredToolNames()).toHaveLength(count);
    });

    Then("the server's instructions say {string}", (_context, expected: string) => {
      expect(serverInstructions()).toContain(expected);
    });

    And("the server's instructions do not mention {string}", (_context, unexpected: string) => {
      expect(serverInstructions()).not.toContain(unexpected);
    });

    And("every tool, action and view the server's instructions name is offered", async () => {
      expect(serverInstructions().match(/\b[a-z]+(?:_[a-z]+)+\b/g)?.length ?? 0).toBeGreaterThan(0);
      expectInstructionsToNameOnlyWhatIsListed(serverInstructions(), await scenario.world.client.listTools());
    });
  });

  Scenario("With only a Git token, none of the session-cookie tools are offered", () => {});
  Scenario("Adding a session cookie offers the review and account tools beside the Git tools", () => {});
  Scenario("With only a session cookie, the tools that need a Git clone are left out", () => {});
  Scenario("With only a session cookie, the instructions do not tell the model to push", () => {});
});
