import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { FakeTexcountProgram } from "../support/fakeTexcountProgram.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const mainDocumentIncludingTheMethod = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}",
  "Three words here.",
  "\\input{sections/method}",
  "\\end{document}",
].join("\n");

const feature = await loadFeature(fileURLToPath(new URL("countingWords.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let texcount: FakeTexcountProgram;
  let project: ConnectedOverleafProject;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
    texcount.remove();
  });

  async function countWords(toolArguments: Record<string, unknown>): Promise<void> {
    lastReply = await callTool(project.client, "read_project", { view: "word_count", ...toolArguments });
  }

  defineSteps(({ Step }) => {
    Step("I count the words", async () => {
      await countWords({});
    });

    Step("I count the words in {string}", async (_context: unknown, path: string) => {
      await countWords({ path });
    });

    Step(
      "I replace {string} with {string} in {string}",
      async (_context: unknown, findText: string, replaceWith: string, path: string) => {
        const edit = await callTool(project.client, "edit_file", {
          action: "replace_text",
          path,
          findText,
          replaceWith,
        });
        expect(edit.isError, edit.text).toBe(false);
      },
    );

    Step("the reply starts with {string}", (_context: unknown, firstLine: string) => {
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text.split("\n")[0]).toBe(firstLine);
    });

    Step("the count says {string}", (_context: unknown, line: string) => {
      expect(lastReply.text.split("\n")).toContain(line);
    });

    Step(
      "the words in text are counted per file as:",
      (_context: unknown, rows: Array<{ file: string; words: string }>) => {
        const lines = lastReply.text.split("\n");
        const perFile = lines.slice(lines.indexOf("Words in text by file:") + 1);
        expect(perFile).toEqual(rows.map((row) => `- ${row.file}: ${row.words}`));
      },
    );

    Step("the reply is an error that says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.isError, lastReply.text).toBe(true);
      expect(lastReply.text).toBe(expected);
    });
  });

  Background(({ Given, And }) => {
    Given("texcount is installed", async () => {
      texcount = await FakeTexcountProgram.install();
    });

    And(
      `the main document has three words of text and includes "sections/method.tex", which has two`,
      async () => {
        project = await ConnectedOverleafProject.openWith({
          publishedFiles: [
            { path: "main.tex", content: mainDocumentIncludingTheMethod, commitMessage: "Draft" },
            {
              path: "sections/method.tex",
              content: "\\section{Method}\nTwo more.\n",
              commitMessage: "Method",
            },
            { path: "refs.bib", content: "@article{a,\n}\n", commitMessage: "References" },
          ],
          environmentOverrides: () => texcount.pathEnvironment(),
        });
      },
    );
  });

  Scenario("The likely main document is counted together with what it includes", () => {});
  Scenario("An edit not pushed yet is counted", () => {});
  Scenario("A file that does not exist is refused, naming the .tex files that do", () => {});
  Scenario("Only a .tex file can be counted", () => {});
});
