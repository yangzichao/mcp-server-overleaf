import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject, publishedNotes } from "../support/connectedOverleafProject.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const firstEntry = "@article{first,\n  title = {First},\n}";

const feature = await loadFeature(fileURLToPath(new URL("appendingToFiles.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
  });

  async function append(toolArguments: Record<string, unknown>): Promise<void> {
    lastReply = await callTool(project.client, "edit_file", { action: "append", ...toolArguments });
  }

  function localText(path: string): Promise<string> {
    return project.client.call("read_file", { path });
  }

  defineSteps(({ Step }) => {
    Step("I append {string} to {string}", async (_context: unknown, content: string, path: string) => {
      await append({ path, content });
    });

    Step("I append to {string} without giving any text", async (_context: unknown, path: string) => {
      await append({ path });
    });

    Step("I push the work as {string}", async (_context: unknown, commitMessage: string) => {
      const push = await callTool(project.client, "push_changes", { commitMessage });
      expect(push.isError, push.text).toBe(false);
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text).toContain(expected);
    });

    Step("the reply is an error that says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.isError, lastReply.text).toBe(true);
      expect(lastReply.text).toContain(expected);
    });

    Step(
      "{string} reads its first entry, then {string} on the next line",
      async (_context: unknown, path: string, appended: string) => {
        expect(await localText(path)).toBe(`${firstEntry}\n${appended}`);
      },
    );

    Step("Overleaf's {string} still holds only its first entry", async (_context: unknown, path: string) => {
      expect(await project.remote.readPublishedFile(path)).toBe(firstEntry);
    });

    Step(
      "Overleaf's {string} ends with {string}",
      async (_context: unknown, path: string, ending: string) => {
        expect(await project.remote.readPublishedFile(path)).toBe(`${firstEntry}\n${ending}`);
      },
    );

    Step(
      "{string} reads its old line, then {string} right after it",
      async (_context: unknown, path: string, appended: string) => {
        expect(await localText(path)).toBe(`${publishedNotes}${appended}`);
      },
    );

    Step("nothing is pending", async () => {
      expect(await project.client.call("read_project", { view: "changes" })).toBe(
        "No local changes pending.",
      );
    });
  });

  Background(({ Given, And }) => {
    let refsBib = "";

    Given(
      "the co-author has published {string} with one entry and no newline after it",
      (_context: unknown, path: string) => {
        refsBib = path;
      },
    );

    And("{string}, which ends with a newline", async (_context: unknown, notesPath: string) => {
      project = await ConnectedOverleafProject.openWith({
        publishedFiles: [
          { path: refsBib, content: firstEntry, commitMessage: "Bibliography without a final newline" },
          { path: notesPath, content: publishedNotes, commitMessage: "Notes ending in a newline" },
        ],
      });
    });
  });

  Scenario("The appended text starts on a line of its own", () => {});
  Scenario("Pushing publishes the appended text", () => {});
  Scenario("No blank line is added to a file that already ends with a newline", () => {});
  Scenario("A file that does not exist is not created", () => {});
  Scenario("Appending nothing changes nothing", () => {});
  Scenario("The text to append is required", () => {});
});
