import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject, publishedPaper } from "../support/connectedOverleafProject.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const coAuthorConclusion = "The co-author's new conclusion.";

const editArgumentsByKind: Record<string, Record<string, unknown>> = {
  "text replacement": { action: "replace_text", findText: "5000", replaceWith: "8000" },
  "section rewrite": {
    action: "replace_section",
    sectionTitle: "Introduction",
    content: "\\section{Introduction}\nRewritten.\n",
  },
  "whole-file write": { action: "write", content: "Replaced entirely.\n" },
};

const feature = await loadFeature(fileURLToPath(new URL("refusingStaleEdits.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let keptRevision = "";
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
  });

  async function keepRevisionOf(path: string): Promise<void> {
    const read = JSON.parse(await project.client.call("read_file", { path, mode: "full" }));
    keptRevision = read.revision;
  }

  async function makeEdit(kind: string, path: string): Promise<void> {
    const editArguments = editArgumentsByKind[kind];
    if (!editArguments) throw new Error(`No edit of kind "${kind}"`);
    lastReply = await callTool(project.client, "edit_file", {
      ...editArguments,
      path,
      expectedRevision: keptRevision,
    });
  }

  async function coAuthorPublishesNewConclusion(): Promise<void> {
    await project.remote.collaboratorPushes(
      "main.tex",
      publishedPaper.replace("Placeholder.", coAuthorConclusion),
      "Co-author rewrites the conclusion",
    );
  }

  async function expectNothingPending(): Promise<void> {
    expect(await project.client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  }

  function expectStaleRevisionRefusal(): void {
    expect(lastReply.isError).toBe(true);
    expect(lastReply.text).toContain("File changed since the supplied revision. Nothing was written.");
  }

  defineSteps(({ Step }) => {
    Step(
      "I make a text replacement to {string} passing the revision I kept",
      async (_context, path: string) => {
        await makeEdit("text replacement", path);
      },
    );

    Step("I write {string} passing the revision I kept", async (_context: unknown, path: string) => {
      await makeEdit("whole-file write", path);
    });

    Step("the co-author then deletes {string}", async (_context: unknown, path: string) => {
      await project.remote.collaboratorDeletes(path, `Delete ${path}`);
    });

    Step("the edit is accepted", () => {
      expect(lastReply.isError).toBe(false);
      expect(lastReply.text).toContain("Replaced 1 occurrence(s) in main.tex.");
    });

    Step("the write is refused because the file no longer exists", () => {
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain("File no longer exists. Nothing was written");
    });

    Step("there is nothing pending", expectNothingPending);
  });

  Background(({ Given, And }) => {
    Given("the co-author has published a paper reporting a sample size of 5000", async () => {
      project = await ConnectedOverleafProject.open();
    });
    And("I have read {string} and kept its revision", async (_context: unknown, path: string) => {
      await keepRevisionOf(path);
    });
  });

  ScenarioOutline(
    "Every kind of edit is refused once the co-author has changed the file",
    ({ Given, When, Then, And }, variables) => {
      Given("the co-author then publishes a new conclusion", coAuthorPublishesNewConclusion);
      When(`I make a <edit> to "main.tex" passing the revision I kept`, async () => {
        await makeEdit(variables.edit, "main.tex");
      });
      Then("the edit is refused because the file changed since the read", expectStaleRevisionRefusal);
      And("there is nothing pending", expectNothingPending);
      And(`"main.tex" reads back with the co-author's new conclusion`, async () => {
        expect(await project.client.call("read_file", { path: "main.tex" })).toContain(coAuthorConclusion);
      });
    },
  );

  Scenario("An edit against a file nobody has changed goes through", () => {});

  Scenario("A guarded write to a file the co-author has since deleted is refused", ({ Given }) => {
    Given(`I have read "notes.tex" and kept its revision`, async () => {
      await keepRevisionOf("notes.tex");
    });
  });
});
