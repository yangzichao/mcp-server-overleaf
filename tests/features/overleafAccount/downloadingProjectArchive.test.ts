import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { FAKE_ZIP_BYTES } from "../../integration/fakeOverleafAccount.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";
import { defineDownloadFolderSteps } from "./downloadFolderSteps.js";

const feature = await loadFeature(
  fileURLToPath(new URL("downloadingProjectArchive.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

const OLDER_ARCHIVE = Buffer.concat([FAKE_ZIP_BYTES.subarray(0, 4), Buffer.from("an older archive")]);

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    defineDownloadFolderSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    Given(
      "the download folder already holds an older archive named {string}",
      (_context, fileName: string) => {
        writeFileSync(scenario.world.downloadFolder.pathOf(fileName), OLDER_ARCHIVE);
      },
    );

    When("I download the project as {string}", async (_context, fileName: string) => {
      await scenario.world.callTool("manage_project", {
        action: "download_zip",
        saveTo: scenario.world.downloadFolder.pathOf(fileName),
      });
    });

    When("I download the project to the relative path {string}", async (_context, relativePath: string) => {
      await scenario.world.callTool("manage_project", { action: "download_zip", saveTo: relativePath });
    });

    Then("the reply says the archive was saved as {string}", (_context, fileName: string) => {
      const savedPath = scenario.world.downloadFolder.pathOf(fileName);
      expect(scenario.world.lastReply.text).toBe(
        `Saved the project archive (${FAKE_ZIP_BYTES.length} bytes) to ${savedPath}.`,
      );
    });

    for (const keyword of [Then, And]) {
      keyword(
        "{string} in the download folder holds the archive Overleaf built",
        (_context, fileName: string) => {
          expect(readFileSync(scenario.world.downloadFolder.pathOf(fileName))).toEqual(FAKE_ZIP_BYTES);
        },
      );
    }
  });

  Background(() => {});

  Scenario("The archive is saved where asked", () => {});
  Scenario("An earlier archive at that path is replaced", () => {});
  Scenario("A file that is not an archive is never overwritten", () => {});
  Scenario("A folder that does not exist is refused", () => {});
  Scenario("A path that does not end in .zip is refused", () => {});
  Scenario("A relative path is refused", () => {});
});
