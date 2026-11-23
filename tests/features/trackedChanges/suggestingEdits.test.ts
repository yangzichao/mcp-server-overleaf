import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { COLLABORATOR_USER_ID, editorPaper } from "../support/connectedOverleafEditor.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

// An absolute path: loadFeature resolves a relative one against the transformed module.
const feature = await loadFeature(fileURLToPath(new URL("suggestingEdits.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

async function reviewPanelListing(path: string): Promise<string> {
  return await scenario.world.client.call("read_review", { view: "tracked_changes", path });
}

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    Given("Overleaf keeps {string} in the newer history-OT format", (_context, path: string) => {
      scenario.world.editor.historyOtDocumentIds.add(scenario.world.documentIdOf(path));
    });

    When("I suggest replacing {string} with {string}", async (_context, findText, replaceWith) => {
      await scenario.world.callTool("manage_tracked_changes", {
        action: "suggest",
        path: "main.tex",
        findText,
        replaceWith,
      });
    });

    When(
      "I suggest replacing {string} with {string} in {string}",
      async (_context, findText, replaceWith, path) => {
        await scenario.world.callTool("manage_tracked_changes", {
          action: "suggest",
          path,
          findText,
          replaceWith,
        });
      },
    );

    When("I list the tracked changes in {string}", async (_context, path: string) => {
      await scenario.world.callTool("read_review", { view: "tracked_changes", path });
    });

    Then("the reply says the suggestion is waiting in the review panel", () => {
      expect(scenario.world.lastReply.text).toContain(
        "in the review panel, waiting to be accepted or rejected",
      );
    });

    And("the review panel lists {int} tracked changes in {string}", async (_context, count: number, path) => {
      expect(await reviewPanelListing(path)).toContain(`${count} tracked changes in ${path}`);
    });

    Then("the review panel lists 1 tracked change in {string}", async (_context, path: string) => {
      expect(await reviewPanelListing(path)).toContain(`1 tracked change in ${path}`);
    });

    And("the review panel shows a suggested deletion of {string} on line 3", async (_context, text) => {
      expect(await reviewPanelListing("main.tex")).toContain(`line 3: delete "${text}"`);
    });

    And("the review panel shows a suggested insertion of {string} on line 3", async (_context, text) => {
      expect(await reviewPanelListing("main.tex")).toContain(`line 3: insert "${text}"`);
    });

    Then(
      "reading {string} through the Git bridge still gives {string}",
      async (_context, path: string, acceptedText: string) => {
        const viaGitBridge = await scenario.world.client.call("read_file", { path });
        expect(viaGitBridge).toContain(acceptedText);
        expect(viaGitBridge).toBe(editorPaper);
      },
    );

    Then("the reply lists a suggested insertion of {string} by the collaborator", (_context, text) => {
      expect(scenario.world.lastReply.text).toContain(`insert "${text}" by ${COLLABORATOR_USER_ID}`);
    });

    Then("the reply says the text appears more than once", () => {
      expect(scenario.world.lastReply.text).toContain("appears more than once");
    });

    Then("the reply says the text does not appear in the document", () => {
      expect(scenario.world.lastReply.text).toContain(
        "That text does not appear in the document. Nothing was suggested.",
      );
    });

    And("Overleaf holds {int} tracked changes in {string}", (_context, count: number, path: string) => {
      expect(scenario.world.trackedChangesIn(path)).toHaveLength(count);
    });

    Then("the reply says there is no editable document at {string}", (_context, path: string) => {
      expect(scenario.world.lastReply.text).toContain(`No editable document at "${path}"`);
    });

    And("the reply names {string} as a document that exists", (_context, path: string) => {
      expect(scenario.world.lastReply.text).toContain(`Editable documents: ${path}`);
    });

    Then("the reply explains the history-OT format and points to the Git-bridge tools", () => {
      expect(scenario.world.lastReply.text).toContain("newer history-OT format");
      expect(scenario.world.lastReply.text).toContain("Git-bridge tools");
    });

    Then("the suggestion is {string}", (_context, outcome: string) => {
      const { lastReply } = scenario.world;
      if (outcome === "recorded") {
        expect(lastReply.isError).toBe(false);
        expect(scenario.world.trackedChangesIn("main.tex")).toHaveLength(2);
        return;
      }
      expect(outcome).toBe("refused");
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain("read-only access");
      expect(scenario.world.trackedChangesIn("main.tex")).toHaveLength(0);
    });
  });

  Background(() => {});

  Scenario("A suggestion arrives in the review panel at once", () => {});
  Scenario("The Git bridge keeps the text nobody has accepted yet", () => {});
  Scenario("An empty replacement suggests a deletion and nothing more", () => {});
  Scenario("A document nobody has touched has nothing to review", () => {});
  Scenario("A collaborator's suggestion is listed with who made it", () => {});
  Scenario("Text that appears twice is refused rather than guessed at", () => {});
  Scenario("Text that is not in the paper is refused", () => {});
  Scenario("A wrong path is answered with the documents that do exist", () => {});
  Scenario("A document in Overleaf's newer history-OT format is explained", () => {});
  ScenarioOutline("Any account that can review may suggest, and read-only access is refused", () => {});
});
