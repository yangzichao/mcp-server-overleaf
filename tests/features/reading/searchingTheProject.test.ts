import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { paperSplitAcrossFiles } from "../support/paperSplitAcrossFiles.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const feature = await loadFeature(fileURLToPath(new URL("searchingTheProject.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
  });

  defineSteps(({ Step }) => {
    Step("I search for {string}", async (_context: unknown, query: string) => {
      lastReply = await callTool(project.client, "search_project", { query });
    });

    Step("I search for the regular expression {string}", async (_context: unknown, query: string) => {
      lastReply = await callTool(project.client, "search_project", { query, isRegularExpression: true });
    });

    Step("I create {string} saying {string}", async (_context: unknown, path: string, content: string) => {
      await project.client.call("edit_file", { action: "write", path, content });
    });

    Step("the matches are:", (_context: unknown, rows: Array<{ match: string }>) => {
      expect(lastReply.text.split("\n")).toEqual(rows.map((row) => row.match));
    });

    Step("the reply says there are no matches for {string}", (_context: unknown, query: string) => {
      expect(lastReply.text).toBe(`No matches for "${query}".`);
    });

    Step("the search fails with {string}", (_context: unknown, reason: string) => {
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(reason);
    });
  });

  Background(({ Given }) => {
    Given("the co-author has published a paper whose method lives in {string}", async () => {
      project = await ConnectedOverleafProject.openWith({ publishedFiles: paperSplitAcrossFiles });
    });
  });

  Scenario("A literal search finds every matching line in every file", () => {});
  Scenario("A search ignores letter case", () => {});
  Scenario("LaTeX commands are found as written, with no escaping", () => {});
  Scenario("A regular expression search matches a pattern", () => {});
  Scenario("A search with no matches says so", () => {});
  Scenario("A file created here is not searched until it is pushed", () => {});
  Scenario("An invalid regular expression is reported, not run", () => {});
});
