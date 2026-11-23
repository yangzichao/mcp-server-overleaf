import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";

import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

// An absolute path: loadFeature resolves a relative one against the transformed module.
const feature = await loadFeature(fileURLToPath(new URL("choosingAProject.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

async function listTrackedChanges(path: string, project?: string): Promise<void> {
  const view = "tracked_changes";
  await scenario.world.callTool(
    "read_review",
    project === undefined ? { view, path } : { view, path, project },
  );
}

describeFeature(feature, ({ Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { When } = steps;

    When("I list the configured projects", async () => {
      await scenario.world.callTool("list_projects");
    });

    When("I list the tracked changes in {string} without naming a project", (_context, path: string) =>
      listTrackedChanges(path),
    );

    When(
      "I list the tracked changes in {string} of the project at its Overleaf address",
      (_context, path: string) =>
        listTrackedChanges(path, `https://www.overleaf.com/project/${scenario.world.projectId}`),
    );

    When("I list the tracked changes in {string} of the project by its id", (_context, path: string) =>
      listTrackedChanges(path, scenario.world.projectId),
    );

    When(
      "I list the tracked changes in {string} of the project {string}",
      (_context, path: string, project: string) => listTrackedChanges(path, project),
    );
  });

  Scenario("A project registered without a Git token is the default", () => {});
  Scenario("A project is reached by its Overleaf address", () => {});
  Scenario("A project is reached by its id", () => {});
  Scenario("Without a project or a default, the reply asks which project is meant", () => {});
  Scenario("A project the account cannot open is reported as such", () => {});
});
