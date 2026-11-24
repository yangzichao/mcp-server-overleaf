import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import type { FakeTag } from "../../integration/fakeWebRoutes/fakeTagRoutes.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";
import { accountProjectNamed, overleafAddressOf } from "./accountProjectLookup.js";

const feature = await loadFeature(fileURLToPath(new URL("taggingProjects.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

function tagNamed(name: string): FakeTag {
  const tag = scenario.world.web.tagRoutes.tags.find((candidate) => candidate.name === name);
  if (!tag) throw new Error(`The account has no tag "${name}".`);
  return tag;
}

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  let lastTaggedProject = "";

  async function changeTag(action: "tag" | "untag", projectName: string, tag?: string): Promise<void> {
    lastTaggedProject = projectName;
    await scenario.world.callTool("manage_project", {
      action,
      project: overleafAddressOf(scenario, projectName),
      tag,
    });
  }

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    Given("the account has a tag {string} holding no projects", (_context, name: string) => {
      scenario.world.web.tagRoutes.addTag(name, []);
    });

    Given(
      "the account has a tag {string} holding {string}",
      (_context, name: string, projectName: string) => {
        scenario.world.web.tagRoutes.addTag(name, [accountProjectNamed(scenario, projectName)._id]);
      },
    );

    When("I tag {string} with {string}", async (_context, projectName: string, tag: string) => {
      await changeTag("tag", projectName, tag);
    });

    When("I tag {string} without naming a tag", async (_context, projectName: string) => {
      await changeTag("tag", projectName);
    });

    When("I untag {string} from {string}", async (_context, projectName: string, tag: string) => {
      await changeTag("untag", projectName, tag);
    });

    Then(
      "the reply says the project was tagged with {string}, and co-authors see no change",
      (_context, tag: string) => {
        const { lastReply } = scenario.world;
        expect(lastReply.isError, lastReply.text).toBe(false);
        expect(lastReply.text).toBe(
          `Tagged "${lastTaggedProject}" with "${tag}". Tags are this account's own, so co-authors see no change.`,
        );
      },
    );

    And("the account's tags are {string}", (_context, names: string) => {
      expect(scenario.world.web.tagRoutes.tags.map((tag) => tag.name)).toEqual(names.split(", "));
    });

    And("the tag {string} holds {string}", (_context, name: string, projectName: string) => {
      expect(tagNamed(name).project_ids).toEqual([accountProjectNamed(scenario, projectName)._id]);
    });

    And("the tag {string} holds no projects", (_context, name: string) => {
      expect(tagNamed(name).project_ids).toEqual([]);
    });
  });

  Background(() => {});

  Scenario("Tagging with a name the account has no tag for creates the tag", () => {});
  Scenario("A tag whose name differs only in case is reused", () => {});
  Scenario("Tagging a project that already has the tag changes nothing", () => {});
  Scenario("Untagging takes the project out and keeps the tag", () => {});
  Scenario("Untagging a project that does not have the tag changes nothing", () => {});
  Scenario("Untagging with a tag the account does not have names the tags it has", () => {});
  Scenario("Tagging needs the tag's name", () => {});
});
