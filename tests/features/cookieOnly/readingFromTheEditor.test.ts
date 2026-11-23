import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { SMALL_PNG } from "../../integration/support/testImages.js";
import { editorPaper } from "../support/connectedOverleafEditor.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("readingFromTheEditor.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

function listedEntries(): string[] {
  return scenario.world.lastReply.text.split("\n").map((line) => line.trim());
}

function uploadToProjectRoot(name: string, bytes: Buffer): void {
  const { tree } = scenario.world.editor;
  tree.upload(tree.rootFolderId, name, bytes, false);
}

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Given, When, Then, And, But } = steps;

    Given("the project has an uploaded figure {string}", (_context, name: string) => {
      uploadToProjectRoot(name, SMALL_PNG);
    });

    Given("the project has an uploaded file {string}", (_context, name: string) => {
      uploadToProjectRoot(name, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]));
    });

    When("I list the project's files", async () => {
      await scenario.world.callTool("read_project", { view: "files" });
    });

    When("I list the project's files with the extension {string}", async (_context, extension: string) => {
      await scenario.world.callTool("read_project", { view: "files", extension });
    });

    When("I read {string}", async (_context, path: string) => {
      await scenario.world.callTool("read_file", { path });
    });

    When(
      "I read lines {int} to {int} of {string}",
      async (_context, startLine: number, endLine: number, path: string) => {
        await scenario.world.callTool("read_file", { path, startLine, endLine });
      },
    );

    And("the listing includes {string}", (_context, path: string) => {
      expect(listedEntries()).toContain(path);
    });

    for (const keyword of [Then, And]) {
      keyword("the listing includes {string} as a binary upload", (_context, path: string) => {
        expect(listedEntries()).toContain(`${path} (binary)`);
      });
    }

    But("the listing does not include {string}", (_context, path: string) => {
      expect(listedEntries()).not.toContain(path);
      expect(listedEntries()).not.toContain(`${path} (binary)`);
    });

    Then("the reply is the whole paper", () => {
      expect(scenario.world.lastReply.text).toBe(editorPaper);
    });

    Then("the reply is line 3, numbered, reading {string}", (_context, line: string) => {
      expect(scenario.world.lastReply.text).toBe(`3\t${line}`);
    });

    Then("the read is refused", () => {
      expect(scenario.world.lastReply.isError).toBe(true);
    });

    And("the reply holds the figure as a PNG image", () => {
      expect(scenario.world.lastReply.content).toContainEqual({
        type: "image",
        data: SMALL_PNG.toString("base64"),
        mimeType: "image/png",
      });
    });
  });

  Background(() => {});

  Scenario("The listing shows every file, the main document, and which files are uploads", () => {});
  Scenario("The listing can be narrowed to one extension", () => {});
  Scenario("A document is read whole", () => {});
  Scenario("A line range comes back with line numbers", () => {});
  Scenario("A suggestion nobody has accepted yet reads as if it had been", () => {});
  Scenario("Text in other scripts reads back as it was written", () => {});
  Scenario("An uploaded figure comes back as an image", () => {});
  Scenario(
    "An upload that is not an image is refused and the project archive is suggested instead",
    () => {},
  );
  Scenario("A wrong path is answered with the documents that do exist", () => {});
  Scenario("A start line after the end line is refused", () => {});
  Scenario("A start line past the end of the document is refused", () => {});
});
