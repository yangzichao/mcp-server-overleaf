import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { paperSplitAcrossFiles } from "../support/paperSplitAcrossFiles.js";
import { callTool } from "../support/toolReply.js";

interface OutlineRow {
  readonly heading: string;
  readonly lines: string;
  readonly file?: string;
}

const feature = await loadFeature(fileURLToPath(new URL("navigatingSections.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let lastReply = "";
  let lastReplyWasRefused = false;

  AfterEachScenario(async () => {
    await project.close();
  });

  function outlineHeadings(): string[] {
    return lastReply
      .split("\n")
      .filter((line) => line.trim().startsWith("\\"))
      .map((line) => line.trim());
  }

  defineSteps(({ Step }) => {
    Step("I list the sections of {string} alone", async (_context: unknown, path: string) => {
      lastReply = await project.client.call("read_project", { view: "outline", path, followIncludes: false });
    });

    Step("I list the sections of {string}", async (_context: unknown, path: string) => {
      lastReply = await project.client.call("read_project", { view: "outline", path });
    });

    Step(
      "I read the section {string} of {string}",
      async (_context: unknown, sectionTitle: string, path: string) => {
        const reply = await callTool(project.client, "read_file", { path, sectionTitle });
        lastReply = reply.text;
        lastReplyWasRefused = reply.isError;
      },
    );

    Step("the outline lists:", (_context: unknown, rows: OutlineRow[]) => {
      expect(outlineHeadings()).toEqual(rows.map((row) => `${row.heading}  [lines ${row.lines}]`));
    });

    Step("the outline lists, in reading order:", (_context: unknown, rows: OutlineRow[]) => {
      expect(outlineHeadings()).toEqual(
        rows.map((row) => `${row.heading}  [${row.file} lines ${row.lines}]`),
      );
    });

    Step(
      "the outline reports {string} on line {int} of {string} as not found",
      (_context: unknown, written: string, lineNumber: number, path: string) => {
        expect(lastReply).toContain(`Not found: ${written} at ${path}:${lineNumber}`);
      },
    );

    Step("the reply contains {string}", (_context: unknown, expected: string) => {
      expect(lastReply).toContain(expected);
    });

    Step("the reply does not contain {string}", (_context: unknown, unexpected: string) => {
      expect(lastReply).not.toContain(unexpected);
    });

    Step(
      "the reply says no section matches {string} and lists {string}",
      (_context: unknown, sectionTitle: string, availableTitles: string) => {
        expect(lastReplyWasRefused).toBe(true);
        expect(lastReply).toBe(
          `No section matching "${sectionTitle}" in main.tex. Available: ${availableTitles}`,
        );
      },
    );
  });

  Background(({ Given }) => {
    Given("the co-author has published a paper whose method lives in {string}", async () => {
      project = await ConnectedOverleafProject.openWith({ publishedFiles: paperSplitAcrossFiles });
    });
  });

  Scenario("The outline of one file alone lists its headings with their line ranges", () => {});
  Scenario("The outline of the whole paper follows the files it includes", () => {});
  Scenario("Reading one section leaves the rest of the paper out", () => {});
  Scenario("A partial title picks the first section that contains it", () => {});
  Scenario("Asking for a section that does not exist lists the ones that do", () => {});
});
