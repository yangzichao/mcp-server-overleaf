import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";
import { accountProjectNamed, overleafAddressOf, webRequestsMatching } from "./accountProjectLookup.js";

const feature = await loadFeature(
  fileURLToPath(new URL("copyingAndRenamingProjects.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  let idBeforeRename = "";

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { When, Then, And } = steps;

    And(
      `the account holds "Fake paper", which I own, and "Shared Thesis", which I was invited to edit`,
      () => {
        expect(accountProjectNamed(scenario, "Fake paper").accessLevel).toBe("owner");
        expect(accountProjectNamed(scenario, "Shared Thesis").accessLevel).toBe("readWrite");
      },
    );

    When("I copy {string} as {string}", async (_context, source: string, name: string) => {
      await scenario.world.callTool("manage_project", {
        action: "copy",
        project: overleafAddressOf(scenario, source),
        name,
      });
    });

    When("I copy {string} without a name", async (_context, source: string) => {
      await scenario.world.callTool("manage_project", {
        action: "copy",
        project: overleafAddressOf(scenario, source),
      });
    });

    When("I rename {string} to {string}", async (_context, current: string, name: string) => {
      idBeforeRename = accountProjectNamed(scenario, current)._id;
      await scenario.world.callTool("manage_project", {
        action: "rename",
        project: overleafAddressOf(scenario, current),
        name,
      });
    });

    Then(
      "the reply gives the Overleaf address of the copy {string} of {string}",
      (_context, copyName: string, source: string) => {
        const { lastReply } = scenario.world;
        expect(lastReply.isError, lastReply.text).toBe(false);
        expect(lastReply.text).toContain(
          `Copied "${source}" to a new project "${copyName}" at ${overleafAddressOf(scenario, copyName)}, `,
        );
      },
    );

    And("the account owns a project named {string}", (_context, name: string) => {
      expect(accountProjectNamed(scenario, name).accessLevel).toBe("owner");
    });

    And("the account still holds {string}", (_context, name: string) => {
      expect(accountProjectNamed(scenario, name)).toBeDefined();
    });

    Then(
      "the reply says {string} became {string} at the same Overleaf address",
      (_context, oldName: string, newName: string) => {
        const { lastReply } = scenario.world;
        expect(lastReply.isError, lastReply.text).toBe(false);
        expect(lastReply.text).toBe(
          `Renamed "${oldName}" to "${newName}"; its address stays ${scenario.world.editor.baseUrl}/project/${idBeforeRename}.`,
        );
      },
    );

    And("the account holds {string} in place of {string}", (_context, newName: string, oldName: string) => {
      expect(accountProjectNamed(scenario, newName)._id).toBe(idBeforeRename);
      expect(scenario.world.account.projects.some((project) => project.name === oldName)).toBe(false);
    });

    And("Overleaf was never asked to rename a project", () => {
      expect(webRequestsMatching(scenario, /\/rename$/)).toEqual([]);
    });
  });

  Background(() => {});

  Scenario("A copy is a new project this account owns", () => {});
  Scenario("A copy needs a name", () => {});
  Scenario("The owner renames a project, which keeps its address", () => {});
  Scenario("Renaming to the name it already has changes nothing", () => {});
  Scenario("Only the owner may rename a project", () => {});
});
