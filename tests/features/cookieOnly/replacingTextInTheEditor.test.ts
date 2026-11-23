import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { editorPaper } from "../support/connectedOverleafEditor.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

const feature = await loadFeature(
  fileURLToPath(new URL("replacingTextInTheEditor.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

const REFUSALS: Record<string, string> = {
  "refused, pointing to manage_tracked_changes": "Use manage_tracked_changes (action suggest) instead.",
  "refused as read-only": "This account has read-only access to the project, so it cannot edit it.",
};

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { When, Then, And } = steps;

    When(
      "I replace {string} with {string} in {string}",
      async (_context, findText: string, replaceWith: string, path: string) => {
        await scenario.world.callTool("edit_file", { action: "replace_text", path, findText, replaceWith });
      },
    );

    When(
      "I replace every {string} with {string} in {string}",
      async (_context, findText: string, replaceWith: string, path: string) => {
        await scenario.world.callTool("edit_file", {
          action: "replace_text",
          path,
          findText,
          replaceWith,
          replaceAll: true,
        });
      },
    );

    for (const keyword of [Then, And]) {
      keyword(
        "Overleaf's copy of {string} reads {string} on line {int}",
        (_context, path: string, line: string, lineNumber: number) => {
          expect(scenario.world.textOf(path).split("\n")[lineNumber - 1]).toBe(line);
        },
      );
    }

    And("the review panel of {string} holds no suggestions", async (_context, path: string) => {
      expect(scenario.world.trackedChangesIn(path)).toHaveLength(0);
      expect(await scenario.world.client.call("read_review", { view: "tracked_changes", path })).toContain(
        `No tracked changes in ${path}.`,
      );
    });

    Then("the replacement is {string}", (_context, outcome: string) => {
      const { lastReply } = scenario.world;
      if (outcome === "made") {
        expect(lastReply.isError, lastReply.text).toBe(false);
        expect(scenario.world.textOf("main.tex").split("\n")[2]).toBe("Goodbye.");
        return;
      }
      const refusal = REFUSALS[outcome];
      if (!refusal) throw new Error(`Unknown outcome "${outcome}".`);
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(refusal);
      expect(scenario.world.textOf("main.tex")).toBe(editorPaper);
    });
  });

  Background(() => {});

  Scenario("A replacement is in Overleaf at once, as ordinary text", () => {});
  Scenario("Text that appears several times is left alone unless every occurrence is asked for", () => {});
  Scenario("Every occurrence is replaced when asked", () => {});
  Scenario("Text that is not in the document changes nothing", () => {});
  Scenario("Text in other scripts, accents and maths is stored as written", () => {});
  ScenarioOutline("Only an account that may edit can replace text", () => {});
  Scenario("A reviewer hears about a wrong snippet the same way an editor does", () => {});
});
