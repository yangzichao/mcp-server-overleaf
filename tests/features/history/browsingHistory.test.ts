import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { firstDraft, type PublishedHistory, publishThreeCommitHistory } from "../support/paperWithHistory.js";

const feature = await loadFeature(fileURLToPath(new URL("browsingHistory.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let history: PublishedHistory;
  let lastReply = "";

  AfterEachScenario(async () => {
    await project.close();
  });

  function listedSubjects(): string[] {
    return lastReply
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.split("  ").at(-1) ?? "");
  }

  defineSteps(({ Step }) => {
    Step("the co-author has since added {string}", async (_context: unknown, path: string) => {
      await project.remote.collaboratorPushes(path, "Results.\n", `Add ${path}`);
    });

    Step("I list the project's history", async () => {
      lastReply = await project.client.call("read_history");
    });

    Step("I list the history of {string}", async (_context: unknown, path: string) => {
      lastReply = await project.client.call("read_history", { path });
    });

    Step(
      "I replace {string} with {string} in {string}",
      async (_context: unknown, findText: string, replaceWith: string, path: string) => {
        await project.client.call("edit_file", { action: "replace_text", path, findText, replaceWith });
      },
    );

    Step("I push the work as {string}", async (_context: unknown, commitMessage: string) => {
      await project.client.call("push_changes", { commitMessage });
    });

    Step("I read {string} as it was in the first draft", async (_context: unknown, path: string) => {
      lastReply = await project.client.call("read_file", {
        path,
        revision: history.firstDraftRevision.slice(0, 7),
      });
    });

    Step(
      "I read {string} from line 2 as it was in the first draft",
      async (_context: unknown, path: string) => {
        lastReply = await project.client.call("read_file", {
          path,
          revision: history.firstDraftRevision,
          startLine: 2,
        });
      },
    );

    Step("I read {string} as it was at the commit that added it", async (_context: unknown, path: string) => {
      lastReply = await project.client.call("read_file", { path, revision: history.plotAddedRevision });
    });

    Step(
      "I read {string} as it was at commit {string}",
      async (_context: unknown, path: string, revision: string) => {
        lastReply = await project.client.call("read_file", { path, revision });
      },
    );

    Step("I compare the first draft with Overleaf's latest version", async () => {
      lastReply = await project.client.call("read_history", {
        view: "diff",
        fromRevision: history.firstDraftRevision,
      });
    });

    Step("I compare the first draft with itself", async () => {
      lastReply = await project.client.call("read_history", {
        view: "diff",
        fromRevision: history.firstDraftRevision,
        toRevision: history.firstDraftRevision,
      });
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply).toContain(expected);
    });

    Step("the commits are listed in this order:", (_context: unknown, rows: Array<{ subject: string }>) => {
      expect(listedSubjects()).toEqual(rows.map((row) => row.subject));
    });

    Step("the commits start with {string}", (_context: unknown, subject: string) => {
      expect(listedSubjects()[0]).toBe(subject);
    });

    Step("the history names {string} as the author", (_context: unknown, author: string) => {
      expect(lastReply).toContain(`  ${author}  `);
    });

    Step("the history says {string}", (_context: unknown, expected: string) => {
      expect(lastReply).toContain(expected);
    });

    Step("the history does not mention {string}", (_context: unknown, unexpected: string) => {
      expect(lastReply).not.toContain(unexpected);
    });

    Step("the reply is exactly the first draft", () => {
      expect(lastReply).toBe(firstDraft);
    });

    Step(
      "the reply is exactly line 2 {string} followed by an empty line 3",
      (_context: unknown, secondLine: string) => {
        expect(lastReply).toBe(`2\t${secondLine}\n3\t`);
      },
    );

    Step("the comparison shows {string} and {string}", (_context: unknown, ...lines: string[]) => {
      for (const line of lines) expect(lastReply.split("\n")).toContain(line);
    });

    Step("the comparison mentions {string}", (_context: unknown, path: string) => {
      expect(lastReply).toContain(path);
    });
  });

  Background(({ Given }) => {
    Given("the co-author wrote a first draft, added a plot, then rewrote the draft", async () => {
      project = await ConnectedOverleafProject.openWith({
        publishedFiles: [],
        prepareRemote: async (remote) => {
          history = await publishThreeCommitHistory(remote);
        },
      });
    });
  });

  Scenario("The history lists commits newest first, with author and changed files", () => {});
  Scenario("The history of one file leaves out commits that did not touch it", () => {});
  Scenario("Work pushed from here appears in the history", () => {});
  Scenario("A file can be read as it was at an earlier commit", () => {});
  Scenario("An earlier version can be read with line numbers", () => {});
  Scenario("A commit that does not exist is reported, pointing at read_history", () => {});
  Scenario("A file that did not exist yet is reported as such", () => {});
  Scenario("A figure is read only as it is now, not as it was at a commit", () => {});
  Scenario("Comparing the first draft with Overleaf's latest shows every change since", () => {});
  Scenario("Comparing a commit with itself finds no differences", () => {});
});
