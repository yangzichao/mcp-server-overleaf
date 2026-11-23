import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const feature = await loadFeature(
  fileURLToPath(new URL("rewritingSectionsAndFiles.feature", import.meta.url)),
);

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
  });

  async function write(path: string, content: string): Promise<void> {
    lastReply = await callTool(project.client, "edit_file", { action: "write", path, content });
  }

  async function readBack(path: string): Promise<string> {
    return await project.client.call("read_file", { path });
  }

  async function expectNothingPending(): Promise<void> {
    expect(await project.client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  }

  defineSteps(({ Step }) => {
    Step(
      "I rewrite the {string} section to say {string}",
      async (_context: unknown, sectionTitle: string, body: string) => {
        lastReply = await callTool(project.client, "edit_file", {
          action: "replace_section",
          path: "main.tex",
          sectionTitle,
          content: `\\section{${sectionTitle}}\n${body}\n`,
        });
      },
    );

    Step("I write {string} containing {string}", async (_context: unknown, path: string, content: string) => {
      await write(path, content);
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.isError).toBe(false);
      expect(lastReply.text).toContain(expected);
    });

    Step("the rewrite is refused with {string}", (_context: unknown, reason: string) => {
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(reason);
    });

    Step("{string} contains {string}", async (_context: unknown, path: string, text: string) => {
      expect(await readBack(path)).toContain(text);
    });

    Step(
      "{string} still contains {string} and {string}",
      async (_context: unknown, path: string, ...texts: string[]) => {
        const content = await readBack(path);
        for (const text of texts) expect(content).toContain(text);
      },
    );

    Step("{string} no longer contains {string}", async (_context: unknown, path: string, text: string) => {
      expect(await readBack(path)).not.toContain(text);
    });

    Step("there is nothing pending", expectNothingPending);

    Step("Overleaf does not hold {string}", async (_context: unknown, path: string) => {
      expect(await project.remote.listPublishedFiles()).not.toContain(path);
    });
  });

  Background(({ Given }) => {
    Given("the co-author has published a paper reporting a sample size of 5000", async () => {
      project = await ConnectedOverleafProject.open();
    });
  });

  Scenario("Rewriting a section keeps the sections around it", () => {});
  Scenario("Rewriting a section that does not exist changes nothing", () => {});
  Scenario("Writing a new file creates it and its folder in the local clone only", () => {});
  Scenario("Writing an existing file replaces all of it", () => {});

  ScenarioOutline(
    "A write that would land outside the project is refused",
    ({ When, Then, And }, variables) => {
      When(`I write "<path>" containing "Should never be written."`, async () => {
        await write(variables.path, "Should never be written.");
      });
      Then(`the write is refused with "<reason>"`, () => {
        expect(lastReply.isError).toBe(true);
        expect(lastReply.text).toContain(variables.reason);
      });
      And("there is nothing pending", expectNothingPending);
    },
  );
});
