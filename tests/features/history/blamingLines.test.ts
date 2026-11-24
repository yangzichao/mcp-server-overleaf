import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import {
  publishDraftRewrittenOnKnownDays,
  type RewriteHistory,
} from "../support/paperRewrittenOnKnownDays.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

interface BlamedLine {
  readonly line: string;
  readonly commit: string;
  readonly day: string;
  readonly author: string;
  readonly text: string;
}

const feature = await loadFeature(fileURLToPath(new URL("blamingLines.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let history: RewriteHistory;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
  });

  function shortRevisionOf(subject: string): string {
    const revision = history.revisionsBySubject.get(subject);
    if (!revision) throw new Error(`The co-author made no commit "${subject}".`);
    return revision.slice(0, 7);
  }

  function blameLinesOfReply(): string[] {
    return lastReply.text.split("\n").filter((line) => /^\d+\t/.test(line));
  }

  async function readHistory(toolArguments: Record<string, unknown>): Promise<void> {
    lastReply = await callTool(project.client, "read_history", toolArguments);
  }

  defineSteps(({ Step }) => {
    Step("I blame {string}", async (_context: unknown, path: string) => {
      await readHistory({ view: "blame", path });
    });

    Step("I blame line {int} of {string}", async (_context: unknown, line: number, path: string) => {
      await readHistory({ view: "blame", path, startLine: line, endLine: line });
    });

    Step("I blame without naming a file", async () => {
      await readHistory({ view: "blame" });
    });

    Step("I list the commits starting from line {int}", async (_context: unknown, startLine: number) => {
      await readHistory({ view: "commits", startLine });
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

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.isError, lastReply.text).toBe(false);
      expect(lastReply.text).toContain(expected);
    });

    Step("the reply does not mention {string}", (_context: unknown, unexpected: string) => {
      expect(lastReply.text).not.toContain(unexpected);
    });

    Step("the lines are blamed as:", (_context: unknown, rows: BlamedLine[]) => {
      const blamed = blameLinesOfReply();
      expect(blamed).toHaveLength(rows.length);
      rows.forEach((row, index) => {
        const [lineNumber, commit, text] = blamed[index]?.split("\t") ?? [];
        expect(lineNumber).toBe(row.line);
        expect(commit).toMatch(
          new RegExp(`^${shortRevisionOf(row.commit)}[0-9a-f]* ${row.day} ${row.author}$`),
        );
        expect(text).toBe(row.text);
      });
    });

    Step(
      "the commits are listed newest first as {string}, then {string}",
      (_context: unknown, newer: string, older: string) => {
        const commits = lastReply.text.slice(lastReply.text.indexOf("Commits, newest first:"));
        const listed = commits.split("\n").filter((line) => line.startsWith("- "));
        expect(listed).toHaveLength(2);
        expect(listed[0]).toContain(shortRevisionOf(newer));
        expect(listed[0]).toMatch(new RegExp(`  ${newer}$`));
        expect(listed[1]).toMatch(new RegExp(`  ${older}$`));
      },
    );

    Step("no line is marked {string}", (_context: unknown, marker: string) => {
      expect(lastReply.text).not.toContain(marker);
    });

    Step(
      "line {int} reads {string} and is marked {string}",
      (_context: unknown, line: number, text: string, marker: string) => {
        expect(blameLinesOfReply()).toContain(`${line}\t${marker}\t${text}`);
      },
    );

    Step("the reply is an error that says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.isError, lastReply.text).toBe(true);
      expect(lastReply.text).toBe(expected);
    });
  });

  Background(({ Given }) => {
    Given(
      "the co-author wrote a three-line draft on 2026-03-01 and rewrote only its second line on 2026-03-02",
      async () => {
        project = await ConnectedOverleafProject.openWith({
          publishedFiles: [],
          prepareRemote: async (remote) => {
            history = await publishDraftRewrittenOnKnownDays(remote);
          },
        });
      },
    );
  });

  Scenario("Every line names the commit that last changed it", () => {});
  Scenario("Only the lines asked for are blamed", () => {});
  Scenario("A line edited here and not pushed yet is marked as not committed", () => {});
  Scenario("Blame needs the file to trace", () => {});
  Scenario("A line range applies to blame only", () => {});
});
