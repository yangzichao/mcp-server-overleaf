import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { shouldRunTexTests } from "../../support/texAvailability.js";
import { ConnectedOverleafProject, publishedPaper } from "../support/connectedOverleafProject.js";

const paperWithUndefinedCommand = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\undefinedcommand",
].join("\n");

const paperCitingOneMissingEntry = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Intro}\\label{sec:intro}",
  "See \\cite{knuth1984} and Section~\\ref{sec:intro}; \\cite{nobody2000} has no entry.",
  "\\begin{thebibliography}{1}",
  "\\bibitem{knuth1984} D. Knuth. Literate programming. 1984.",
  "\\end{thebibliography}",
  "\\end{document}",
].join("\n");

const texIsInstalled = await shouldRunTexTests();

const feature = await loadFeature(fileURLToPath(new URL("compilingThePaper.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  const ScenarioNeedingTex = texIsInstalled ? Scenario : Scenario.skip;
  let project: ConnectedOverleafProject | undefined;
  let lastReport = "";

  AfterEachScenario(async () => {
    await project?.close();
    project = undefined;
  });

  function connectedProject(): ConnectedOverleafProject {
    if (!project) throw new Error("The scenario has no project open.");
    return project;
  }

  async function writeMainFile(content: string): Promise<void> {
    await connectedProject().client.call("edit_file", { action: "write", path: "main.tex", content });
  }

  defineSteps(({ Step }) => {
    Step("I compile the project", async () => {
      lastReport = await connectedProject().client.call("compile_project");
    });

    Step("I compile the project starting from {string}", async (_context: unknown, mainTexFile: string) => {
      lastReport = await connectedProject().client.call("compile_project", { mainTexFile });
    });

    Step("I replace the paper locally with one that uses an undefined command", async () => {
      await writeMainFile(paperWithUndefinedCommand);
    });

    Step("I cite one entry that exists and one that does not", async () => {
      await writeMainFile(paperCitingOneMissingEntry);
    });

    Step("the report says {string}", (_context: unknown, expected: string) => {
      expect(lastReport).toContain(expected);
    });

    Step("the report lists the errors", () => {
      expect(lastReport).toContain("errors:");
    });

    Step("the report warns that {string} is undefined", (_context: unknown, citationKey: string) => {
      expect(lastReport).toContain(`Citation \`${citationKey}' on page 1 undefined`);
    });

    Step("the report does not mention {string}", (_context: unknown, unexpected: string) => {
      expect(lastReport).not.toContain(unexpected);
    });

    Step("the report suggests passing mainTexFile", () => {
      expect(lastReport).toContain("Pass mainTexFile explicitly.");
    });

    Step("the clone holds no PDF, aux or log file", async () => {
      const entries = await readdir(connectedProject().cloneDirectory);
      expect(entries.filter((name) => /\.(pdf|aux|log)$/.test(name))).toEqual([]);
    });

    Step("there is nothing pending", async () => {
      expect(await connectedProject().client.call("read_project", { view: "changes" })).toBe(
        "No local changes pending.",
      );
    });

    Step("Overleaf still holds the paper that compiles", async () => {
      expect(await connectedProject().remote.readPublishedFile("main.tex")).toBe(publishedPaper);
    });
  });

  Background(({ Given }) => {
    Given("the co-author has published a paper that compiles", async () => {
      project = await ConnectedOverleafProject.open();
    });
  });

  ScenarioNeedingTex("A healthy paper compiles and leaves nothing to push", () => {});
  ScenarioNeedingTex("A local edit that breaks the build is caught before it is pushed", () => {});
  ScenarioNeedingTex("Only what the final pass still warns about is reported", () => {});
  ScenarioNeedingTex("Compiling an included file explains that it is not the root document", () => {});
});
