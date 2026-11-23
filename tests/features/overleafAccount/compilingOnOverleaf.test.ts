import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { FAKE_PDF_BYTES } from "../../integration/fakeOverleafAccount.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("compilingOnOverleaf.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

const LOG_WITH_AN_ERROR_AND_A_WARNING = [
  "This is pdfTeX, Version 3.141592653",
  "(./main.tex",
  "./main.tex:3: Undefined control sequence.",
  "l.3 \\foo",
  "LaTeX Warning: Reference `fig:missing' on page 1 undefined on input line 5.",
  ")",
  "Output written on output.pdf (1 page).",
].join("\n");

const MY_NOTES = "my notes, misnamed";

async function compileOnOverleaf(toolArguments: Record<string, unknown> = {}): Promise<void> {
  await scenario.world.callTool("compile_project", { where: "overleaf", ...toolArguments });
}

function buildDirectoryPathOf(outputName: string): string {
  const { world } = scenario;
  return join(world.workspaceDirectory, ".build", world.projectId, "overleaf", outputName);
}

function writeIntoBuildDirectory(outputName: string, content: string): void {
  const path = buildDirectoryPathOf(outputName);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function refuseCompilesAsTooRecent(count: number): void {
  scenario.world.account.refuseCompilesAsTooRecent = count;
}

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Given, When, Then, And, But } = steps;

    Given("an earlier compile on Overleaf saved a PDF", async () => {
      await compileOnOverleaf();
      expect(readFileSync(buildDirectoryPathOf("output.pdf"))).toEqual(FAKE_PDF_BYTES);
    });

    Given("the paper has an undefined control sequence on line 3 and a reference to a missing figure", () => {
      scenario.world.account.compileLog = LOG_WITH_AN_ERROR_AND_A_WARNING;
    });

    Given(
      "BibTeX could not open {string} and found no entry for {string}",
      (_context, bibliographyFile: string, citationKey: string) => {
        scenario.world.account.bibliographyLog = [
          "This is BibTeX, Version 0.99d (TeX Live 2025)",
          `Warning--I didn't find a database entry for "${citationKey}"`,
          `I couldn't open database file ${bibliographyFile}`,
          "(There was 1 error message)",
        ].join("\n");
      },
    );

    for (const keyword of [Given, And]) {
      keyword("the next compile fails with {string} and produces no PDF", (_context, lastWords: string) => {
        const { account } = scenario.world;
        account.compileStatus = "failure";
        account.producesPdf = false;
        account.compileLog = `This is pdfTeX, Version 3.141592653\n${lastWords}\nNo pages of output.`;
      });
    }

    Given(
      "Overleaf answers the next compile with the status {string} and no PDF",
      (_context, status: string) => {
        scenario.world.account.compileStatus = status;
        scenario.world.account.producesPdf = false;
      },
    );

    Given("Overleaf refuses the next 1 compile because the project was compiled moments ago", () => {
      refuseCompilesAsTooRecent(1);
    });

    Given(
      "Overleaf refuses the next {int} compiles because the project was compiled moments ago",
      (_context, count: number) => {
        refuseCompilesAsTooRecent(count);
      },
    );

    Given("the build directory already holds an older PDF", () => {
      writeIntoBuildDirectory("output.pdf", "%PDF-1.4 an older build");
    });

    Given("the build directory holds my notes where the PDF goes", () => {
      writeIntoBuildDirectory("output.pdf", MY_NOTES);
    });

    When("I compile the project on Overleaf", () => compileOnOverleaf());

    When("I compile {string} on Overleaf in draft mode", (_context, mainTexFile: string) =>
      compileOnOverleaf({ mainTexFile, draft: true }),
    );

    And("the reply names the missing bibliography entry {string}", (_context, citationKey: string) => {
      expect(scenario.world.lastReply.text).toContain(
        `Warning--I didn't find a database entry for "${citationKey}"`,
      );
    });

    And("Overleaf was asked to compile {int} times", (_context, count: number) => {
      expect(scenario.world.account.compiles).toHaveLength(count);
    });

    Then("Overleaf was asked to compile {string} in draft mode", (_context, mainTexFile: string) => {
      expect(scenario.world.account.compiles.map((compile) => compile.body)).toEqual([
        expect.objectContaining({ rootResourcePath: mainTexFile, draft: true }),
      ]);
    });

    But("the reply does not say {string}", (_context, unexpected: string) => {
      expect(scenario.world.lastReply.text).not.toContain(unexpected);
    });

    Then("the reply says the PDF was saved as {string} in the build directory", (_context, name: string) => {
      expect(scenario.world.lastReply.text).toContain(
        `Saved the PDF (${FAKE_PDF_BYTES.length} bytes) to ${buildDirectoryPathOf(name)}.`,
      );
    });

    And("the reply says the log was saved as {string} in the build directory", (_context, name: string) => {
      expect(scenario.world.lastReply.text).toContain(`Saved the log to ${buildDirectoryPathOf(name)}.`);
    });

    for (const keyword of [Then, And]) {
      keyword("the build directory holds the PDF Overleaf built", () => {
        expect(readFileSync(buildDirectoryPathOf("output.pdf"))).toEqual(FAKE_PDF_BYTES);
      });
    }

    And("the build directory holds no PDF", () => {
      expect(existsSync(buildDirectoryPathOf("output.pdf"))).toBe(false);
    });

    And("the build directory still holds my notes where the PDF goes", () => {
      expect(readFileSync(buildDirectoryPathOf("output.pdf"), "utf8")).toBe(MY_NOTES);
    });
  });

  Background(() => {});

  Scenario("A clean build is reported as compiled, with its output files", () => {});
  Scenario("Errors in the log are reported even when a PDF was still produced", () => {});
  Scenario("Bibliography problems found by BibTeX are reported", () => {});
  Scenario(
    "A failed build says no PDF was produced, shows the end of the log, and leaves no PDF behind",
    () => {},
  );
  ScenarioOutline("A compile Overleaf did not finish is explained", () => {});
  Scenario("One too-recently-compiled refusal is waited out", () => {});
  Scenario("A second refusal in a row is reported instead of retried forever", () => {});
  Scenario("A chosen root document and draft mode are passed to Overleaf", () => {});
  Scenario("The PDF and the log are saved in the build directory, and the reply gives their paths", () => {});
  Scenario("An earlier PDF in the build directory is replaced", () => {});
  Scenario("A file there that is not a PDF is never overwritten", () => {});
});
