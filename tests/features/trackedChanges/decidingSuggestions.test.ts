import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { editorPaper } from "../support/connectedOverleafEditor.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("decidingSuggestions.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

async function suggest(path: string, findText: string, replaceWith: string): Promise<void> {
  const reply = await scenario.world.callTool("manage_tracked_changes", {
    action: "suggest",
    path,
    findText,
    replaceWith,
  });
  expect(reply.isError, reply.text).toBe(false);
}

function decisionActionFor(decision: string): "accept" | "reject" {
  if (decision === "accept" || decision === "reject") return decision;
  throw new Error(`Unknown decision "${decision}".`);
}

async function decide(action: "accept" | "reject", decision: Record<string, unknown>): Promise<void> {
  await scenario.world.callTool("manage_tracked_changes", { action, ...decision });
}

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    for (const keyword of [Given, And]) {
      keyword("I have suggested replacing {string} with {string}", (_context, findText, replaceWith) =>
        suggest("main.tex", findText, replaceWith),
      );
      keyword(
        "I have suggested replacing {string} with {string} in {string}",
        (_context, findText, replaceWith, path) => suggest(path, findText, replaceWith),
      );
    }

    Given(
      "the project has a document {string} reading {string} then {string}",
      (_context, path: string, firstLine: string, secondLine: string) => {
        scenario.world.addDocument(path, `${firstLine}\n${secondLine}\n`);
      },
    );

    When("I accept every suggestion in {string}", async (_context, path: string) => {
      await decide("accept", { path, all: true });
    });

    When("I reject every suggestion in {string}", async (_context, path: string) => {
      await decide("reject", { path, all: true });
    });

    When("I {string} every suggestion in {string}", async (_context, decision: string, path: string) => {
      await decide(decisionActionFor(decision), { path, all: true });
    });

    When("I accept only the suggested insertion", async () => {
      const changeIds = [scenario.world.changeIdInMainDocument("insertion")];
      await decide("accept", { path: "main.tex", changeIds });
    });

    When("I reject only the suggested insertion", async () => {
      const changeIds = [scenario.world.changeIdInMainDocument("insertion")];
      await decide("reject", { path: "main.tex", changeIds });
    });

    When("I reject the suggested insertion together with the id {string}", async (_context, unknownId) => {
      const changeIds = [scenario.world.changeIdInMainDocument("insertion"), unknownId];
      await decide("reject", { path: "main.tex", changeIds });
    });

    When(
      "I accept suggestions in {string} without naming any or asking for all",
      async (_context, path: string) => {
        await decide("accept", { path });
      },
    );

    Then("the reply says {int} suggestions were accepted in {string}", (_context, count: number, path) => {
      expect(scenario.world.lastReply.text).toContain(`Accepted ${count} suggestions in ${path}`);
    });

    Then("the reply says 1 suggestion was accepted in {string}", (_context, path: string) => {
      expect(scenario.world.lastReply.text).toContain(`Accepted 1 suggestion in ${path}`);
    });

    Then("the reply says {int} suggestions were rejected in {string}", (_context, count: number, path) => {
      expect(scenario.world.lastReply.text).toContain(`Rejected ${count} suggestions in ${path}`);
    });

    And("the paper reads {string} on line 3", (_context, line: string) => {
      expect(scenario.world.textOf("main.tex").split("\n")[2]).toBe(line);
    });

    for (const keyword of [Then, And]) {
      keyword("Overleaf holds no suggestions in {string}", (_context, path: string) => {
        expect(scenario.world.trackedChangesIn(path)).toHaveLength(0);
      });

      keyword("the paper is exactly as it was before the suggestion", () => {
        expect(scenario.world.textOf("main.tex")).toBe(editorPaper);
      });
    }

    And("the only suggestion still pending is the deletion of {string}", (_context, text: string) => {
      const pending = scenario.world.trackedChangesIn("main.tex");
      expect(pending.map((change) => change.op)).toEqual([{ p: expect.any(Number), d: text }]);
    });

    Then("the paper no longer contains {string}", (_context, text: string) => {
      expect(scenario.world.textOf("main.tex")).not.toContain(text);
    });

    Then(
      "{string} reads {string} then {string} again",
      (_context, path: string, firstLine: string, secondLine: string) => {
        expect(scenario.world.textOf(path)).toBe(`${firstLine}\n${secondLine}\n`);
      },
    );

    Then("the reply names the rejected insertion of {string}", (_context, text: string) => {
      expect(scenario.world.lastReply.text).toContain(`insert "${text}"`);
    });

    Then(
      "the reply says there is no tracked change {string} in {string}",
      (_context, changeId: string, path: string) => {
        expect(scenario.world.lastReply.text).toContain(`No tracked change ${changeId} in ${path}`);
      },
    );

    And("Overleaf still holds {int} suggestions in {string}", (_context, count: number, path: string) => {
      expect(scenario.world.trackedChangesIn(path)).toHaveLength(count);
    });

    Then("the reply asks for either changeIds or all", () => {
      expect(scenario.world.lastReply.text).toContain("Give either changeIds or all: true");
    });

    Then("the reply says there are no tracked changes in {string}", (_context, path: string) => {
      expect(scenario.world.lastReply.text).toContain(`There are no tracked changes in ${path}.`);
    });

    Then(
      "the reply says the account has {string} access and needs edit access",
      (_context, wording: string) => {
        expect(scenario.world.lastReply.isError).toBe(true);
        expect(scenario.world.lastReply.text).toContain(`This account has ${wording} access`);
        expect(scenario.world.lastReply.text).toContain("needs edit access");
      },
    );
  });

  Background(() => {});

  Scenario("Accepting every suggestion makes it the paper's text", () => {});
  Scenario("Accepting one suggestion by id leaves the others pending", () => {});
  Scenario("Rejecting every suggestion puts the paper back as it was", () => {});
  Scenario("Rejecting one suggestion by id leaves the others pending", () => {});
  Scenario("Rejecting a suggested deletion brings the text back", () => {});
  Scenario("Rejecting suggestions on several lines restores every line", () => {});
  Scenario("Rejecting a collaborator's suggestion does not leave a suggestion of my own", () => {});
  Scenario("An unknown suggestion id decides nothing at all", () => {});
  Scenario("Deciding needs either the ids or all of them, stated explicitly", () => {});
  Scenario("A document with no suggestions has nothing to decide", () => {});
  ScenarioOutline("An account that may not edit cannot decide suggestions", () => {});
  ScenarioOutline("An account that may edit can decide suggestions", () => {});
});
