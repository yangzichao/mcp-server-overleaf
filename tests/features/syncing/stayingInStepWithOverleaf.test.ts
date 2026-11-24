import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject, publishedPaper } from "../support/connectedOverleafProject.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const feature = await loadFeature(
  fileURLToPath(new URL("stayingInStepWithOverleaf.feature", import.meta.url)),
);

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
  });

  async function projectStatus(): Promise<string> {
    return await project.client.call("read_project", { view: "status" });
  }

  function syncReplyLines(): string[] {
    return lastReply.text.split("\n");
  }

  defineSteps(({ Step }) => {
    Step("I have already opened the project", async () => {
      await project.client.call("read_project", { view: "files" });
    });

    Step("I ask for the project status", async () => {
      lastReply = await callTool(project.client, "read_project", { view: "status" });
    });

    Step("I correct the sample size to 8000", async () => {
      await project.client.call("edit_file", {
        action: "replace_text",
        path: "main.tex",
        findText: "5000",
        replaceWith: "8000",
      });
    });

    Step("I write {string} containing {string}", async (_context: unknown, path: string, content: string) => {
      await project.client.call("edit_file", { action: "write", path, content });
    });

    Step("the co-author publishes a new file {string}", async (_context: unknown, path: string) => {
      await project.remote.collaboratorPushes(path, "Written only by the co-author.\n", `Add ${path}`);
    });

    Step("the co-author publishes a sample size of 20000", async () => {
      await project.remote.collaboratorPushes(
        "main.tex",
        publishedPaper.replace("5000", "20000"),
        "Co-author corrects the sample size",
      );
    });

    Step("I sync the project", async () => {
      lastReply = await callTool(project.client, "read_project", { view: "status" });
    });

    Step("I push the work as {string}", async (_context: unknown, commitMessage: string) => {
      lastReply = await callTool(project.client, "push_changes", { commitMessage });
    });

    Step("I discard the local changes", async () => {
      lastReply = await callTool(project.client, "manage_files", { action: "discard_local_changes" });
    });

    Step("the status reports {string}", async (_context: unknown, line: string) => {
      expect((await projectStatus()).split("\n")).toContain(line);
    });

    Step("the status lists {string} among the edited files", async (_context: unknown, path: string) => {
      const editedFileLines = (await projectStatus()).split("\n").filter((line) => line.startsWith("  "));
      expect(editedFileLines.some((line) => line.endsWith(` ${path}`))).toBe(true);
    });

    Step("pushing now reports {string}", async (_context: unknown, expected: string) => {
      expect(await project.client.call("push_changes", { commitMessage: "Nothing" })).toBe(expected);
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.text).toContain(expected);
    });

    Step("{string} can be read", async (_context: unknown, path: string) => {
      expect(await project.client.call("read_file", { path })).toBe("Written only by the co-author.\n");
    });

    Step("the sync reports {string}", (_context: unknown, line: string) => {
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(syncReplyLines()).toContain(line);
    });

    Step("the sync gives no warning", () => {
      expect(lastReply.text).not.toContain("WARNING");
    });

    Step("the sync warns {string}", (_context: unknown, warning: string) => {
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(syncReplyLines()).toContain(warning);
    });

    Step("the pending diff still shows {string}", async (_context: unknown, line: string) => {
      expect((await project.client.call("read_project", { view: "changes" })).split("\n")).toContain(line);
    });

    Step("reading {string} is refused while the edit is pending", async (_context: unknown, path: string) => {
      const reply = await callTool(project.client, "read_file", { path });
      expect(reply.isError).toBe(true);
      expect(reply.text).toContain("Local work has been preserved");
    });

    Step("Overleaf holds {string} in {string}", async (_context: unknown, text: string, path: string) => {
      expect(await project.remote.readPublishedFile(path)).toContain(text);
    });

    Step(
      "{string} reads back with the co-author's sample size of 20000",
      async (_context: unknown, path: string) => {
        expect(await project.client.call("read_file", { path })).toBe(
          publishedPaper.replace("5000", "20000"),
        );
      },
    );

    Step("there is nothing pending", async () => {
      expect(await project.client.call("read_project", { view: "changes" })).toBe(
        "No local changes pending.",
      );
    });

    Step(
      "the pending diff for {string} leaves out {string}",
      async (_context: unknown, path: string, other: string) => {
        const diff = await project.client.call("read_project", { view: "changes", path });
        expect(diff).toContain(`diff --git a/${path} b/${path}`);
        expect(diff).not.toContain(other);
      },
    );
  });

  Background(({ Given }) => {
    Given("the co-author has published a paper reporting a sample size of 5000", async () => {
      project = await ConnectedOverleafProject.open();
    });
  });

  Scenario("A fresh clone has nothing to push", () => {});
  Scenario("The status names the file edited here", () => {});
  Scenario("Syncing pulls in what the co-author published since the last read", () => {});
  Scenario("Syncing over unpushed edits is held back with a warning and keeps both versions", () => {});
  Scenario("Pushing the pending edit lets the co-author's new work be read", () => {});
  Scenario("A refused push keeps the work for review, and discarding clears it", () => {});
  Scenario("Discarding when nothing is pending says so", () => {});
  Scenario("The pending diff can be narrowed to one file", () => {});
});
