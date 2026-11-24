import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("creatingFolders.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { When, And } = steps;

    When("I create the folder {string}", async (_context, path: string) => {
      await scenario.world.callTool("manage_files", { action: "create_folder", path });
    });

    When("I create a folder without naming it", async () => {
      await scenario.world.callTool("manage_files", { action: "create_folder" });
    });

    And(
      "Overleaf's project has the folders {string} and {string}",
      (_context, parentPath: string, childPath: string) => {
        const { tree } = scenario.world.editor;
        expect(tree.entityAt(parentPath)?.type).toBe("folder");
        expect(tree.entityAt(childPath)?.type).toBe("folder");
      },
    );

    And("Overleaf's project has nothing at {string}", (_context, path: string) => {
      expect(scenario.world.editor.tree.entityAt(path)).toBeUndefined();
    });

    And("nothing is pending in the local clone", async () => {
      expect(await scenario.world.client.call("read_project", { view: "changes" })).toBe(
        "No local changes pending.",
      );
    });
  });

  Background(() => {});

  Scenario("A folder and its missing parent appear in Overleaf right away", () => {});
  Scenario("A folder that already exists is left alone", () => {});
  Scenario("A folder cannot be made inside a file", () => {});
  Scenario("An account that cannot edit the project is refused", () => {});
  Scenario("The folder to create is required", () => {});
});
