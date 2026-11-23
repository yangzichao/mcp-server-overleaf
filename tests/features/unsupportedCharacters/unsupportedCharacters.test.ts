import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("unsupportedCharacters.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

const EDITS: Record<string, { toolName: string; action: string }> = {
  "edit_file replace_text": { toolName: "edit_file", action: "replace_text" },
  "manage_tracked_changes suggest": { toolName: "manage_tracked_changes", action: "suggest" },
};

async function askToReplace(editName: string, findText: string, replaceWith: string): Promise<void> {
  const edit = EDITS[editName];
  if (!edit) throw new Error(`"${editName}" is not one of the edits that replace text.`);
  await scenario.world.callTool(edit.toolName, {
    action: edit.action,
    path: "main.tex",
    findText,
    replaceWith,
  });
}

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { When, Then, And } = steps;

    When(
      "I ask {string} to replace {string} with {string}",
      (_context, editName: string, findText: string, replaceWith: string) =>
        askToReplace(editName, findText, replaceWith),
    );

    When(
      "I ask {string} to replace {string} with text containing a NUL character",
      (_context, editName: string, findText: string) => askToReplace(editName, findText, "Hello\0world."),
    );

    Then("the change is refused, naming {string}", (_context, character: string) => {
      const { lastReply } = scenario.world;
      expect(lastReply.isError).toBe(true);
      const escapedCharacter = character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(lastReply.text).toMatch(
        new RegExp(`^replaceWith contains (NUL|".+" \\(${escapedCharacter}\\))`),
      );
      expect(lastReply.text).toContain(character);
      expect(lastReply.text).toContain("so nothing was changed");
    });

    And("Overleaf holds no suggestions in {string}", (_context, path: string) => {
      expect(scenario.world.trackedChangesIn(path)).toHaveLength(0);
    });

    And("Overleaf's copy of {string} now holds {string}", (_context, path: string, text: string) => {
      expect(scenario.world.textOf(path)).toContain(text);
    });
  });

  Background(() => {});

  ScenarioOutline("A character outside the Basic Multilingual Plane is refused by name", () => {});
  ScenarioOutline("A NUL character is refused", () => {});
  Scenario("The refusal says to write a LaTeX command instead", () => {});
  ScenarioOutline("Characters inside the Basic Multilingual Plane are accepted", () => {});
});
