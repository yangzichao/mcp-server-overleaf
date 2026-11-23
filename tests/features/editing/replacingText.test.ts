import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject, publishedPaper } from "../support/connectedOverleafProject.js";

const feature = await loadFeature(fileURLToPath(new URL("replacingText.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply = "";

  AfterEachScenario(async () => {
    await project.close();
  });

  async function replace(path: string, findText: string, replaceWith: string, replaceAll: boolean) {
    lastReply = await project.client.call("edit_file", {
      action: "replace_text",
      path,
      findText,
      replaceWith,
      replaceAll,
    });
  }

  defineSteps(({ Step }) => {
    Step(
      "the co-author has published {string} with {string} written twice",
      async (_context: unknown, path: string, text: string) => {
        await project.remote.collaboratorPushes(path, `${text}: methods\n${text}: results\n`, `Add ${path}`);
      },
    );

    Step(
      "I replace {string} with {string} in {string}",
      async (_context: unknown, findText: string, replaceWith: string, path: string) => {
        await replace(path, findText, replaceWith, false);
      },
    );

    Step(
      "I replace every {string} with {string} in {string}",
      async (_context: unknown, findText: string, replaceWith: string, path: string) => {
        await replace(path, findText, replaceWith, true);
      },
    );

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply).toContain(expected);
    });

    Step(
      "{string} reads back as published, except {string} became {string}",
      async (_context: unknown, path: string, before: string, after: string) => {
        expect(await project.client.call("read_file", { path })).toBe(publishedPaper.replace(before, after));
      },
    );

    Step("there is nothing pending", async () => {
      expect(await project.client.call("read_project", { view: "changes" })).toBe(
        "No local changes pending.",
      );
    });

    Step("{string} no longer contains {string}", async (_context: unknown, path: string, text: string) => {
      expect(await project.client.call("read_file", { path })).not.toContain(text);
    });

    Step("{string} contains {string}", async (_context: unknown, path: string, text: string) => {
      expect(await project.client.call("read_file", { path })).toContain(text);
    });
  });

  Background(({ Given }) => {
    Given("the co-author has published a paper reporting a sample size of 5000", async () => {
      project = await ConnectedOverleafProject.open();
    });
  });

  Scenario("The snippet is replaced and the rest of the file is left alone", () => {});
  Scenario("Text that is not in the file changes nothing", () => {});
  Scenario("Text that appears more than once is not guessed at", () => {});
  Scenario("Every occurrence is replaced when that is asked for", () => {});
  Scenario("The replacement is inserted exactly as written", () => {});
});
