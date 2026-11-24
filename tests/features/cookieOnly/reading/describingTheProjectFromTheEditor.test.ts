import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { defineEditorProjectSteps, type WrittenLine } from "../../support/editorProjectSteps.js";
import { OverleafEditorScenario } from "../../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../../support/sharedEditorSteps.js";

const feature = await loadFeature(
  fileURLToPath(new URL("describingTheProjectFromTheEditor.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

interface OutlineRow {
  readonly heading: string;
  readonly lines: string;
  readonly file?: string;
}

function paperIncluding(methodPath: string): string {
  return [
    "\\documentclass{article}",
    "\\begin{document}",
    "\\section{Introduction}",
    `\\input{${methodPath.replace(/\.tex$/, "")}}`,
    "\\section{Conclusion}",
    "Done.",
    "\\end{document}",
    "",
  ].join("\n");
}

const METHOD = "\\section{Method}\nWe sampled people.\n\\subsection{Data}\nA survey.";

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  function outlineHeadings(): string[] {
    return scenario.world.lastReply.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("\\"));
  }

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    defineEditorProjectSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    Given(
      "the project has a paper {string} that includes its method from {string}",
      (_context, paperPath: string, methodPath: string) => {
        scenario.world.addDocument(paperPath, paperIncluding(methodPath));
        scenario.world.addDocument(methodPath, METHOD);
      },
    );

    Given(
      "a collaborator has suggested the heading {string} on its own line above {string}",
      (_context, heading: string, before: string) => {
        const { world } = scenario;
        world.editor.collaboratorSuggests(world.mainDocumentId, [
          { p: world.offsetInMainDocument(before), i: `${heading}\n` },
        ]);
      },
    );

    When("I read the project's overview", async () => {
      await scenario.world.callTool("read_project", {});
    });

    When("I read the outline", async () => {
      await scenario.world.callTool("read_project", { view: "outline" });
    });

    When("I read the outline of {string} alone", async (_context, path: string) => {
      await scenario.world.callTool("read_project", { view: "outline", path, followIncludes: false });
    });

    When("I read the project's {string} view", async (_context, view: string) => {
      await scenario.world.callTool("read_project", { view });
    });

    Then("the overview reads:", (_context, rows: WrittenLine[]) => {
      const { lastReply } = scenario.world;
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text.split("\n").slice(0, rows.length)).toEqual(rows.map((row) => row.line));
    });

    Then("the outline lists:", (_context, rows: OutlineRow[]) => {
      expect(outlineHeadings()).toEqual(rows.map((row) => `${row.heading}  [lines ${row.lines}]`));
    });

    And("the outline lists, in reading order:", (_context, rows: OutlineRow[]) => {
      expect(outlineHeadings()).toEqual(
        rows.map((row) => `${row.heading}  [${row.file} lines ${row.lines}]`),
      );
    });
  });

  Background(() => {});

  Scenario(
    "The overview names the project, its main document, its files, its settings and my access",
    () => {},
  );
  ScenarioOutline(
    "The overview says what this account may do, in the words of Overleaf's share dialog",
    () => {},
  );
  Scenario(
    "The outline starts from the main document set in Overleaf's menu and follows what it includes",
    () => {},
  );
  Scenario("The outline of one file alone leaves out the files it includes", () => {});
  Scenario("A heading a co-author has suggested shows in the outline as if accepted", () => {});
  Scenario("An outline of a file that does not exist names the .tex files there are", () => {});
  ScenarioOutline("The views that describe a local clone are not offered", () => {});
});
