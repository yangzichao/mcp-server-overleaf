import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { defineEditorProjectSteps } from "../../support/editorProjectSteps.js";
import { OverleafEditorScenario } from "../../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../../support/sharedEditorSteps.js";

const feature = await loadFeature(
  fileURLToPath(new URL("checkingReferencesInTheEditor.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

function paperIncluding(bodyPath: string): string {
  const included = bodyPath.replace(/\.tex$/, "");
  return `\\documentclass{article}\n\\begin{document}\n\\input{${included}}\n\\end{document}\n`;
}

const BODY_WITH_A_MISSING_LABEL = [
  "\\section{Body}\\label{sec:body}",
  "See Section~\\ref{sec:missing}.",
  "\\includegraphics{figure}",
  "",
].join("\n");

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    defineEditorProjectSteps(steps, scenario);
    const { When, Then, And, But } = steps;

    And(
      "the project has a paper {string} whose body in {string} refers to a missing label and shows the uploaded figure",
      (_context, paperPath: string, bodyPath: string) => {
        scenario.world.addDocument(paperPath, paperIncluding(bodyPath));
        scenario.world.addDocument(bodyPath, BODY_WITH_A_MISSING_LABEL);
      },
    );

    for (const keyword of [When, And]) {
      keyword("I check the references", async () => {
        await scenario.world.callTool("check_references", {});
      });
    }

    When("I check the references starting from {string}", async (_context, mainTexFile: string) => {
      await scenario.world.callTool("check_references", { mainTexFile });
    });

    Then("the check says {string}", (_context, firstLine: string) => {
      const { lastReply } = scenario.world;
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text.split("\n")[0]).toBe(firstLine);
    });

    But("the check does not report {string}, which is uploaded", (_context, written: string) => {
      expect(scenario.world.lastReply.text).not.toContain(written);
    });
  });

  Background(() => {});

  Scenario("The check starts from the main document set in Overleaf's menu", () => {});
  Scenario("A main document named in the call is checked instead", () => {});
  Scenario("A fix made in the editor is checked at once, with no push", () => {});
  Scenario("A main document that does not exist is refused, naming the ones that do", () => {});
});
