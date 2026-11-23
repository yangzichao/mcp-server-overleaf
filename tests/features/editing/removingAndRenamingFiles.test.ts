import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject, publishedNotes } from "../support/connectedOverleafProject.js";

const feature = await loadFeature(
  fileURLToPath(new URL("removingAndRenamingFiles.feature", import.meta.url)),
);

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply = "";

  AfterEachScenario(async () => {
    await project.close();
  });

  defineSteps(({ Step }) => {
    Step("I delete {string}", async (_context: unknown, path: string) => {
      lastReply = await project.client.call("manage_files", { action: "delete", path });
    });

    Step("I move {string} to {string}", async (_context: unknown, path: string, toPath: string) => {
      lastReply = await project.client.call("manage_files", { action: "move", path, toPath });
    });

    Step("I discard the local changes", async () => {
      lastReply = await project.client.call("manage_files", { action: "discard_local_changes" });
    });

    Step("I push the work as {string}", async (_context: unknown, commitMessage: string) => {
      lastReply = await project.client.call("push_changes", { commitMessage });
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply).toContain(expected);
    });

    Step("there is nothing pending", async () => {
      expect(await project.client.call("read_project", { view: "changes" })).toBe(
        "No local changes pending.",
      );
    });

    Step("the pending diff shows {string} as deleted", async (_context: unknown, path: string) => {
      const diff = await project.client.call("read_project", { view: "changes" });
      expect(diff).toContain(`diff --git a/${path} b/${path}`);
      expect(diff).toContain("deleted file mode");
    });

    Step("{string} reads back the co-author's notes", async (_context: unknown, path: string) => {
      expect(await project.client.call("read_file", { path })).toBe(publishedNotes);
    });

    Step("Overleaf holds {string} with the co-author's notes", async (_context: unknown, path: string) => {
      expect(await project.remote.readPublishedFile(path)).toBe(publishedNotes);
    });

    Step("Overleaf no longer holds {string}", async (_context: unknown, path: string) => {
      expect(await project.remote.listPublishedFiles()).not.toContain(path);
    });
  });

  Background(({ Given }) => {
    Given("the co-author has published a paper and shared notes", async () => {
      project = await ConnectedOverleafProject.open();
    });
  });

  Scenario("Deleting a file that is not in the project deletes nothing", () => {});
  Scenario("The pending diff shows a deletion before it is pushed", () => {});
  Scenario("Discarding local changes brings a deleted file back", () => {});
  Scenario("Moving onto a file that already exists is refused and keeps both", () => {});
  Scenario("Moving a file that is not in the project moves nothing", () => {});
  Scenario("Pushing a rename publishes the file under its new path only", () => {});
});
