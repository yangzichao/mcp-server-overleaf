import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

// An absolute path: loadFeature resolves a relative one against the transformed module.
const feature = await loadFeature(fileURLToPath(new URL("accountProjects.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

function projectAddress(projectName: string): string {
  const project = scenario.world.account.projects.find((candidate) => candidate.name === projectName);
  if (!project) throw new Error(`The account holds no project "${projectName}".`);
  return `${scenario.world.editor.baseUrl}/project/${project._id}`;
}

function listedLineFor(projectName: string): string | undefined {
  return scenario.world.lastReply.text.split("\n").find((line) => line.startsWith(`- ${projectName} — `));
}

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Given, When, Then, And, But } = steps;

    And(
      `the account holds "Fake paper", which I own, "Shared Thesis", which I was invited to edit, and "Grant Proposal", which I may only view`,
      () => {
        expect(scenario.world.account.projects.map((project) => [project.name, project.accessLevel])).toEqual(
          [
            ["Fake paper", "owner"],
            ["Shared Thesis", "readWrite"],
            ["Grant Proposal", "readOnly"],
          ],
        );
      },
    );

    Given(
      "the account also holds {string} with the access level {string}",
      (_context, name: string, accessLevel: string) => {
        scenario.world.account.projects.push({ _id: "64d000000000000000000001", name, accessLevel });
      },
    );

    When("I list the projects in the account", async () => {
      await scenario.world.callTool("list_projects");
    });

    When(
      "I list the projects in the account whose name contains {string}",
      async (_context, nameContains: string) => {
        await scenario.world.callTool("list_projects", { nameContains });
      },
    );

    When("I create a project named {string}", async (_context, name: string) => {
      await scenario.world.callTool("manage_project", { action: "create", name });
    });

    When(
      "I create a project named {string} from the {string} template",
      async (_context, name: string, template: string) => {
        await scenario.world.callTool("manage_project", { action: "create", name, template });
      },
    );

    for (const keyword of [Then, And]) {
      keyword(
        "{string} is listed as {string} at its Overleaf address",
        (_context, projectName: string, access: string) => {
          expect(listedLineFor(projectName)).toMatch(
            new RegExp(`^- ${projectName} — ${access} — ${projectAddress(projectName)}( \\(registered|$)`),
          );
        },
      );
    }

    Then(
      "{string} is marked as registered here as {string}",
      (_context, projectName: string, registeredName: string) => {
        expect(listedLineFor(projectName)).toMatch(new RegExp(`\\(registered here as ${registeredName}\\)$`));
      },
    );

    And("{string} is listed", (_context, projectName: string) => {
      expect(listedLineFor(projectName)).toBeDefined();
    });

    But("{string} is not listed", (_context, projectName: string) => {
      expect(listedLineFor(projectName)).toBeUndefined();
    });

    Then(
      "the reply says no project in the account has {string} in its name",
      (_context, nameContains: string) => {
        const replyLines = scenario.world.lastReply.text.split("\n");
        expect(replyLines).toContain(`No project in the account has "${nameContains}" in its name.`);
        expect(replyLines.filter((line) => line.startsWith("- "))).toEqual([]);
      },
    );

    Then("the reply gives the Overleaf address of the new project {string}", (_context, name: string) => {
      expect(scenario.world.lastReply.text).toContain(
        `Created the project "${name}" at ${projectAddress(name)}.`,
      );
    });

    for (const keyword of [Then, And]) {
      keyword("the account now holds a project named {string}", (_context, name: string) => {
        const created = scenario.world.account.projects.at(-1);
        expect(created).toMatchObject({ name, accessLevel: "owner" });
      });
    }

    Then(
      "the account now holds a project named {string} made from the example paper",
      (_context, name: string) => {
        // The fake marks a project made from the example template by its name.
        expect(scenario.world.account.projects.at(-1)?.name).toBe(`${name} (example)`);
      },
    );

    Then("the reply says the name is too short", () => {
      expect(scenario.world.lastReply.text).toContain("Input validation error");
      expect(scenario.world.lastReply.text).toContain("name: Too small");
    });

    And("Overleaf was never asked to create a project", () => {
      expect(scenario.world.web.requests.some((request) => request.path === "/project/new")).toBe(false);
      expect(scenario.world.account.projects).toHaveLength(3);
    });
  });

  Background(() => {});

  Scenario("Every project is listed with my access and its address", () => {});
  Scenario("A project this server already knows is marked with its registered name", () => {});
  ScenarioOutline("Each access level is named the way a person would say it", () => {});
  Scenario("The list can be narrowed by part of a name, ignoring case", () => {});
  Scenario("A filter that matches nothing says so", () => {});
  Scenario("A new project is created and its address returned", () => {});
  Scenario("A new project can start from Overleaf's example paper", () => {});
  Scenario("Spaces around the name are left out", () => {});
  Scenario("A blank name is refused before Overleaf is asked", () => {});
});
