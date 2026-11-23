import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { expect } from "vitest";

import type { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import type { StepDefinitions } from "../support/sharedEditorSteps.js";

const MY_NOTES = "my notes, misnamed";

/** Steps about the local folder a PDF or a project archive is saved into. */
export function defineDownloadFolderSteps(steps: StepDefinitions, scenario: OverleafEditorScenario): void {
  const { Given, And } = steps;

  Given("the download folder holds my notes, misnamed {string}", (_context, fileName: string) => {
    writeFileSync(scenario.world.downloadFolder.pathOf(fileName), MY_NOTES);
  });

  And("{string} in the download folder still holds my notes", (_context, fileName: string) => {
    expect(readFileSync(scenario.world.downloadFolder.pathOf(fileName), "utf8")).toBe(MY_NOTES);
  });

  And("there is no {string} in the download folder", (_context, fileName: string) => {
    expect(existsSync(scenario.world.downloadFolder.pathOf(fileName))).toBe(false);
  });
}
