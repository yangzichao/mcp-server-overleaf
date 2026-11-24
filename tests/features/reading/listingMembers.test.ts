import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("listingMembers.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

describeFeature(feature, ({ Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { When, Then, And } = steps;

    When("I list the project's members", async () => {
      await scenario.world.callTool("read_project", { view: "members" });
    });

    When("I list the members of {string}", async (_context, path: string) => {
      await scenario.world.callTool("read_project", { view: "members", path });
    });

    Then("the reply reads:", (_context, expectedListing: string) => {
      expect(scenario.world.lastReply.isError, scenario.world.lastReply.text).toBe(false);
      expect(scenario.world.lastReply.text).toBe(expectedListing);
    });

    And(
      "the collaborators listed are:",
      (_context, rows: Array<{ collaborator: string; access: string }>) => {
        const lines = scenario.world.lastReply.text.split("\n");
        const heading = lines.findIndex((line) => line.startsWith("Collaborators ("));
        expect(lines[heading]).toBe(`Collaborators (${rows.length}):`);
        expect(lines.slice(heading + 1, heading + 1 + rows.length)).toEqual(
          rows.map((row) => `- ${row.collaborator} — ${row.access}`),
        );
      },
    );

    And("Overleaf was never asked for the invitations", () => {
      expect(scenario.world.web.requests.filter((request) => request.path.endsWith("/invites"))).toEqual([]);
    });
  });

  Scenario("The owner sees every collaborator and the invitations still pending", () => {});
  Scenario("A collaborator sees who owns the project, but not the invitations", () => {});
  Scenario("The members view is about the whole project, not one file", () => {});
});
