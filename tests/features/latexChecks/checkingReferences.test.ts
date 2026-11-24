import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject, type PublishedFile } from "../support/connectedOverleafProject.js";

const paperWithReferenceProblems: readonly PublishedFile[] = [
  {
    path: "main.tex",
    content: [
      "\\documentclass{article}",
      "\\begin{document}",
      "\\section{Introduction}\\label{sec:intro}",
      "\\input{sections/method}",
      "See \\ref{sec:method} and \\ref{fig:missing}, after \\cite{smith2020}.",
      "\\includegraphics{figures/plot}",
      "\\includegraphics{figures/absent}",
      "\\bibliography{refs}",
      "\\end{document}",
    ].join("\n"),
    commitMessage: "Draft",
  },
  {
    path: "sections/method.tex",
    content: "\\section{Method}\\label{sec:method}\n\\subsection{Data}\nAs \\cite{Jones2019} found.\n",
    commitMessage: "Method",
  },
  {
    path: "refs.bib",
    content: "@article{smith2020,\n}\n@article{jones2019,\n}\n@book{unused2000,\n}\n",
    commitMessage: "References",
  },
  {
    path: "figures/plot.png",
    content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]),
    commitMessage: "Plot",
  },
  { path: "old/notes.tex", content: "\\ref{nowhere}\n", commitMessage: "Notes" },
];

const feature = await loadFeature(fileURLToPath(new URL("checkingReferences.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply = "";

  AfterEachScenario(async () => {
    await project.close();
  });

  defineSteps(({ Step }) => {
    Step("I check the references", async () => {
      lastReply = await project.client.call("check_references");
    });

    Step("I check the references starting from {string}", async (_context: unknown, mainTexFile: string) => {
      lastReply = await project.client.call("check_references", { mainTexFile });
    });

    Step("I point the broken figure reference at the introduction instead", async () => {
      await project.client.call("edit_file", {
        action: "replace_text",
        path: "main.tex",
        findText: "\\ref{fig:missing}",
        replaceWith: "\\ref{sec:intro}",
      });
    });

    Step("the check says {string}", (_context: unknown, expected: string) => {
      expect(lastReply).toContain(expected);
    });

    Step("the check lists these problems:", (_context: unknown, rows: Array<{ problem: string }>) => {
      expect(lastReply.split("\n")).toEqual(
        expect.arrayContaining(rows.map((row) => expect.stringContaining(`  ${row.problem}`))),
      );
    });

    Step("the check does not report {string}, which exists", (_context: unknown, path: string) => {
      expect(lastReply).not.toContain(`{${path}}`);
    });

    Step("the check does not report {string}", (_context: unknown, key: string) => {
      expect(lastReply).not.toContain(key);
    });

    Step("the check notes {string}", (_context: unknown, note: string) => {
      const notes = lastReply.split("Worth a look, not errors:")[1] ?? "";
      expect(notes).toContain(note);
    });

    Step("the check says there is no file at {string}", (_context: unknown, path: string) => {
      expect(lastReply).toContain(`No file at "${path}"`);
    });

    Step("the check names the .tex files that exist: {string}", (_context: unknown, paths: string) => {
      expect(lastReply).toContain(paths);
    });
  });

  Background(({ Given }) => {
    Given(
      "the co-author has published a paper with a method section, a bibliography and a figure",
      async () => {
        project = await ConnectedOverleafProject.openWith({ publishedFiles: paperWithReferenceProblems });
      },
    );
  });

  Scenario("Each problem is reported with the file and line to fix", () => {});
  Scenario("What is worth a look but not wrong is noted separately", () => {});
  Scenario("The check reads local edits, so a fix shows up before it is pushed", () => {});
  Scenario("A main document that does not exist is refused, naming the ones that do", () => {});
});
