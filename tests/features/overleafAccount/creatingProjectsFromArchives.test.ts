import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { FAKE_ZIP_BYTES } from "../../integration/fakeOverleafAccount.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";
import { accountProjectNamed, overleafAddressOf } from "./accountProjectLookup.js";
import { defineDownloadFolderSteps } from "./downloadFolderSteps.js";

const feature = await loadFeature(
  fileURLToPath(new URL("creatingProjectsFromArchives.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

const PROJECTS_THE_ACCOUNT_STARTS_WITH = ["Fake paper", "Shared Thesis", "Grant Proposal"];

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  async function createFromZip(sourcePath: string, name?: string): Promise<void> {
    await scenario.world.callTool("manage_project", { action: "create_from_zip", sourcePath, name });
  }

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    defineDownloadFolderSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    Given("the download folder holds a ZIP archive named {string}", (_context, fileName: string) => {
      writeFileSync(scenario.world.downloadFolder.pathOf(fileName), FAKE_ZIP_BYTES);
    });

    And("Overleaf will reject the next upload because {string}", (_context, reason: string) => {
      scenario.world.web.lifecycle.rejectNextProjectUpload = reason;
    });

    When("I create a project from {string}", async (_context, fileName: string) => {
      await createFromZip(scenario.world.downloadFolder.pathOf(fileName));
    });

    When(
      "I create a project named {string} from {string}",
      async (_context, name: string, fileName: string) => {
        await createFromZip(scenario.world.downloadFolder.pathOf(fileName), name);
      },
    );

    When("I create a project from the relative path {string}", async (_context, relativePath: string) => {
      await createFromZip(relativePath);
    });

    Then("the reply gives the Overleaf address of the new project {string}", (_context, name: string) => {
      const { lastReply } = scenario.world;
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text).toContain(`Created the project "${name}" from `);
      expect(lastReply.text).toContain(` at ${overleafAddressOf(scenario, name)}.`);
    });

    And("the account owns a project named {string}", (_context, name: string) => {
      expect(accountProjectNamed(scenario, name).accessLevel).toBe("owner");
    });

    And("nothing was uploaded to Overleaf", () => {
      expect(scenario.world.web.lifecycle.projectUploads).toEqual([]);
    });

    And("the account holds only the projects it held before", () => {
      expect(scenario.world.account.projects.map((project) => project.name)).toEqual(
        PROJECTS_THE_ACCOUNT_STARTS_WITH,
      );
    });
  });

  Background(() => {});

  Scenario("The new project is named after the archive", () => {});
  Scenario("A name given replaces the archive's name", () => {});
  Scenario("A file that is not a ZIP archive is refused before anything is uploaded", () => {});
  Scenario("An archive that does not exist is refused", () => {});
  Scenario("A relative path is refused", () => {});
  Scenario("An archive Overleaf rejects is reported with Overleaf's reason", () => {});
});
