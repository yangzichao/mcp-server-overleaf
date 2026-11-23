import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import {
  firstDraft,
  type PublishedHistory,
  plotBytes,
  publishThreeCommitHistory,
  secondDraft,
} from "../support/paperWithHistory.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const feature = await loadFeature(fileURLToPath(new URL("restoringFiles.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let history: PublishedHistory;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
  });

  async function restore(path: string, revision: string): Promise<void> {
    lastReply = await callTool(project.client, "manage_files", { action: "restore", path, revision });
  }

  defineSteps(({ Step }) => {
    Step("the co-author has since deleted {string}", async (_context: unknown, path: string) => {
      await project.remote.collaboratorDeletes(path, `Delete ${path}`);
    });

    Step("I restore {string} to the first draft", async (_context: unknown, path: string) => {
      await restore(path, history.firstDraftRevision.slice(0, 7));
    });

    Step("I restore {string} to the commit that added it", async (_context: unknown, path: string) => {
      await restore(path, history.plotAddedRevision);
    });

    Step("I push the work as {string}", async (_context: unknown, commitMessage: string) => {
      lastReply = await callTool(project.client, "push_changes", { commitMessage });
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.text).toContain(expected);
    });

    Step("{string} reads back as the first draft", async (_context: unknown, path: string) => {
      expect(await project.client.call("read_file", { path })).toBe(firstDraft);
    });

    Step("the pending diff shows {string}", async (_context: unknown, line: string) => {
      expect((await project.client.call("read_project", { view: "changes" })).split("\n")).toContain(line);
    });

    Step("Overleaf still holds the rewritten draft", async () => {
      expect(await project.remote.readPublishedFile("main.tex")).toBe(secondDraft);
    });

    Step("Overleaf holds the first draft", async () => {
      expect(await project.remote.readPublishedFile("main.tex")).toBe(firstDraft);
    });

    Step("Overleaf holds the plot's exact bytes at {string}", async (_context: unknown, path: string) => {
      expect(await project.remote.readPublishedBytes(path)).toEqual(plotBytes);
    });

    Step("the restore is refused because the file {string}", (_context: unknown, reason: string) => {
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(reason);
    });

    Step("the refusal points to {string} for removing a file", (_context: unknown, pointer: string) => {
      expect(lastReply.text).toContain(`To remove the file, use ${pointer}.`);
    });

    Step("there is nothing pending", async () => {
      expect(await project.client.call("read_project", { view: "changes" })).toBe(
        "No local changes pending.",
      );
    });
  });

  Background(({ Given }) => {
    Given("the co-author wrote a first draft, added a plot, then rewrote the draft", async () => {
      project = await ConnectedOverleafProject.openWith({
        publishedFiles: [],
        prepareRemote: async (remote) => {
          history = await publishThreeCommitHistory(remote);
        },
      });
    });
  });

  Scenario("Restoring the first draft waits in the clone until it is pushed", () => {});
  Scenario("Pushing a restore publishes the earlier version", () => {});
  Scenario("A deleted figure comes back byte for byte", () => {});
  Scenario("Restoring a file that did not exist at that commit is refused", () => {});
});
