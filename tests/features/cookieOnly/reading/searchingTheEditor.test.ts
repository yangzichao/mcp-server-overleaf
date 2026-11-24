import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { OverleafEditorScenario } from "../../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../../support/sharedEditorSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("searchingTheEditor.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { When, Then, And } = steps;

    for (const keyword of [When, And]) {
      keyword("I search for {string}", async (_context, query: string) => {
        await scenario.world.callTool("search_project", { query });
      });
    }

    When("I search for the regular expression {string}", async (_context, query: string) => {
      await scenario.world.callTool("search_project", { query, isRegularExpression: true });
    });

    When("I write {string} saying {string}", async (_context, path: string, line: string) => {
      await scenario.world.callTool("edit_file", { action: "write", path, content: `${line}\n` });
      expect(scenario.world.lastReply.isError, scenario.world.lastReply.text).toBe(false);
    });

    Then("the matches are:", (_context, rows: Array<{ match: string }>) => {
      const { lastReply } = scenario.world;
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text.split("\n")).toEqual(rows.map((row) => row.match));
    });
  });

  Background(() => {});

  Scenario("A search covers every editable document and ignores letter case", () => {});
  Scenario("A regular expression search matches a pattern", () => {});
  Scenario("A co-author's pending suggestion is searched as if accepted", () => {});
  Scenario("A document written a moment ago is found at once, with no push", () => {});
  Scenario("A search with no matches says so", () => {});
  Scenario("An invalid regular expression is reported, not run", () => {});
  Scenario("An account that may only view the project can still search it", () => {});
});
