import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";
import { accountProjectNamed, overleafAddressOf, webRequestsMatching } from "./accountProjectLookup.js";

const feature = await loadFeature(fileURLToPath(new URL("organisingProjects.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

const LIST_MOVES = ["archive", "unarchive", "trash", "untrash"];
const LIST_FILTERS: Record<string, string> = { main: "all", archived: "archived", trashed: "trashed" };

function filterForList(list: string): string {
  const filter = LIST_FILTERS[list];
  if (!filter)
    throw new Error(`Unknown project list "${list}". Known: ${Object.keys(LIST_FILTERS).join(", ")}.`);
  return filter;
}

async function projectsListedIn(list: string): Promise<string[]> {
  const listing = await scenario.world.client.call("list_projects", { filter: filterForList(list) });
  return listing
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).split(" — ")[0] ?? "");
}

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Given, When, Then, And, But } = steps;

    And(
      `the account holds "Shared Thesis", which I was invited to edit, and "Grant Proposal", which I may only view`,
      () => {
        expect(accountProjectNamed(scenario, "Shared Thesis").accessLevel).toBe("readWrite");
        expect(accountProjectNamed(scenario, "Grant Proposal").accessLevel).toBe("readOnly");
      },
    );

    Given("{string} is in the account's {string} list", (_context, name: string, list: string) => {
      filterForList(list);
      const project = accountProjectNamed(scenario, name);
      project.archived = list === "archived";
      project.trashed = list === "trashed";
    });

    When("I {string} {string}", async (_context, action: string, name: string) => {
      if (!LIST_MOVES.includes(action))
        throw new Error(`"${action}" is not one of ${LIST_MOVES.join(", ")}.`);
      await scenario.world.callTool("manage_project", { action, project: overleafAddressOf(scenario, name) });
    });

    Then("the reply says Overleaf archived {string} for this account only", (_context, name: string) => {
      const { lastReply } = scenario.world;
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text).toContain(`Archived "${name}" for this account`);
      expect(lastReply.text).toContain("Co-authors' project lists do not change.");
    });

    for (const keyword of [Then, And, But]) {
      keyword("{string} is in the account's {string} list", async (_context, name: string, list: string) => {
        expect(await projectsListedIn(list)).toContain(name);
      });

      keyword(
        "{string} is not in the account's {string} list",
        async (_context, name: string, list: string) => {
          expect(await projectsListedIn(list)).not.toContain(name);
        },
      );
    }

    And("Overleaf was never asked to move a project", () => {
      expect(webRequestsMatching(scenario, /\/(archive|trash)$/i)).toEqual([]);
    });
  });

  Background(() => {});

  Scenario("An archived project leaves the main list for the archived one", () => {});
  Scenario("Unarchiving brings a project back to the main list", () => {});
  Scenario("A trashed project is kept, and untrash brings it back", () => {});
  Scenario("A project I may only view can still be archived, since the archive is mine", () => {});
  ScenarioOutline("A project already where the action would put it is left alone", () => {});
});
