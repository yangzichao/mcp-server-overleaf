import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject, publishedPaper } from "../support/connectedOverleafProject.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const feature = await loadFeature(fileURLToPath(new URL("readingFiles.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
  });

  async function readLines(startLine: number, endLine: number): Promise<void> {
    lastReply = await callTool(project.client, "read_file", { path: "main.tex", startLine, endLine });
  }

  async function read(path: string): Promise<void> {
    lastReply = await callTool(project.client, "read_file", { path });
  }

  defineSteps(({ Step }) => {
    Step("I list the project's files", async () => {
      lastReply = await callTool(project.client, "read_project", { view: "files" });
    });

    Step("I create {string} in the local clone", async (_context: unknown, path: string) => {
      await project.client.call("edit_file", {
        action: "write",
        path,
        content: "A draft only this computer has.\n",
      });
    });

    Step("the co-author changes the conclusion to {string}", async (_context: unknown, text: string) => {
      await project.remote.collaboratorPushes(
        "main.tex",
        publishedPaper.replace("Placeholder.", text),
        "Co-author fills in the conclusion",
      );
    });

    Step("I create an empty {string} in the local clone", async (_context: unknown, path: string) => {
      await project.client.call("edit_file", { action: "write", path, content: "" });
    });

    Step("I read {string}", async (_context: unknown, path: string) => {
      await read(path);
    });

    Step(
      "I read lines {int} to {int} of {string}",
      async (_context: unknown, first: number, last: number) => {
        await readLines(first, last);
      },
    );

    Step("I ask for the project summary", async () => {
      lastReply = await callTool(project.client, "read_project", { view: "overview" });
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.text).toContain(expected);
    });

    Step(
      "the reply lists {string} and {string} as LaTeX sources",
      (_context: unknown, ...paths: string[]) => {
        expect(lastReply.text).toContain(`tex (2):\n${paths.map((path) => `  ${path}`).join("\n")}`);
      },
    );

    Step("listing the files does not show {string}", async (_context: unknown, path: string) => {
      expect(await project.client.call("read_project", { view: "files" })).not.toContain(path);
    });

    Step(
      "listing the files with local files included shows {string}",
      async (_context: unknown, entry: string) => {
        expect(
          await project.client.call("read_project", { view: "files", includeUntracked: true }),
        ).toContain(entry);
      },
    );

    Step("line {int} reads {string}", (_context: unknown, lineNumber: number, text: string) => {
      expect(lastReply.text).toBe(`${lineNumber}\t${text}`);
    });

    Step("the read fails and names {string}", (_context: unknown, path: string) => {
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(path);
    });

    Step("the summary reports {int} files, all of them LaTeX sources", (_context: unknown, count: number) => {
      expect(lastReply.text.split("\n")).toContain(
        `Files: ${count} (tex ${count}), ${count} of them already in Overleaf.`,
      );
    });

    Step(
      "the summary names {string} as the main document with {int} sections",
      (_context: unknown, mainFile: string, totalSections: number) => {
        expect(lastReply.text.split("\n")).toContain(
          `Likely main document: ${mainFile}, with ${totalSections} sectioning commands in that file.`,
        );
      },
    );
  });

  Background(({ Given }) => {
    Given("the co-author has published a paper and shared notes", async () => {
      project = await ConnectedOverleafProject.open();
    });
  });

  Scenario("Listing the files names the likely main document", () => {});
  Scenario("A file created here is listed only when local files are asked for", () => {});
  Scenario("The co-author's newest version is the one that gets read", () => {});

  ScenarioOutline("A line range comes back numbered and clamped to the file", ({ When, Then }, variables) => {
    const first = Number(variables.first);
    When(`I read lines <first> to <last> of "main.tex"`, async () => {
      await readLines(first, Number(variables.last));
    });
    Then("the reply shows lines <first> to <shownLast>, each prefixed with its number", () => {
      const expectedNumbers = Array.from(
        { length: Number(variables.shownLast) - first + 1 },
        (_, offset) => `${first + offset}`,
      );
      const shownNumbers = lastReply.text.split("\n").map((line) => line.split("\t")[0]);
      expect(shownNumbers).toEqual(expectedNumbers);
      expect(lastReply.text.split("\n")[0]).toBe(`${first}\t${publishedPaper.split("\n")[first - 1]}`);
    });
  });

  Scenario("Line numbers match the file's own lines", () => {});
  Scenario("A start line past the end of the file is refused", () => {});
  Scenario("An empty file is said to be empty", () => {});
  Scenario("A file that does not exist is reported, not invented", () => {});

  ScenarioOutline("A path outside the project is refused", ({ When, Then }, variables) => {
    When(`I read "<path>"`, async () => {
      await read(variables.path);
    });
    Then(`the read fails with "<reason>"`, () => {
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(variables.reason);
    });
  });

  Scenario("The summary counts the files and finds the main document", () => {});
});
