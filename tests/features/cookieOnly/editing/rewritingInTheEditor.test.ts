import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { defineEditorProjectSteps, textOfLines, type WrittenLine } from "../../support/editorProjectSteps.js";
import { OverleafEditorScenario } from "../../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../../support/sharedEditorSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("rewritingInTheEditor.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();

const CHAPTER_PATH = "chapter.tex";
const CHAPTER = "\\section{Intro}\nOld intro.\n\\section{Method}\nMethod text.\n";
const COMMENT_THREAD_ID = "c0ffee000000000000000001";

const EDIT_OF_THE_CHAPTER: Record<string, Record<string, unknown>> = {
  replace_section: { sectionTitle: "Intro", content: "\\section{Intro}\nA new introduction." },
  write: { content: "\\section{Intro}\nRewritten.\n" },
  append: { content: "% A closing note." },
};

const REFUSALS: Record<string, string> = {
  "refused, pointing to manage_tracked_changes": "Use manage_tracked_changes (action suggest) instead.",
  "refused as read-only": "This account has read-only access to the project, so it cannot edit it.",
};

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  function chapterText(): string {
    return scenario.world.textOf(CHAPTER_PATH);
  }

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    defineEditorProjectSteps(steps, scenario);
    const { When, Then, And } = steps;

    And("the project has a chapter {string} with an Intro and a Method section", (_context, path: string) => {
      scenario.world.addDocument(path, CHAPTER);
    });

    And("a co-author has commented on {string} in the chapter", (_context, quotedText: string) => {
      const { world } = scenario;
      world.editor.addComment(
        world.documentIdOf(CHAPTER_PATH),
        quotedText,
        CHAPTER.indexOf(quotedText),
        COMMENT_THREAD_ID,
      );
    });

    When(
      "I replace the section {string} of {string} with:",
      async (_context, sectionTitle: string, path: string, rows: WrittenLine[]) => {
        const content = rows.map((row) => row.line).join("\n");
        await scenario.world.callTool("edit_file", {
          action: "replace_section",
          path,
          sectionTitle,
          content,
        });
      },
    );

    When("I write {string} as:", async (_context, path: string, rows: WrittenLine[]) => {
      await scenario.world.callTool("edit_file", { action: "write", path, content: textOfLines(rows) });
    });

    When("I write {string} with the text it already holds", async (_context, path: string) => {
      await scenario.world.callTool("edit_file", {
        action: "write",
        path,
        content: scenario.world.textOf(path),
      });
    });

    When("I append {string} to {string}", async (_context, content: string, path: string) => {
      await scenario.world.callTool("edit_file", { action: "append", path, content });
    });

    When("I use edit_file's action {string} on the chapter", async (_context, action: string) => {
      const edit = EDIT_OF_THE_CHAPTER[action];
      if (!edit) throw new Error(`No edit of the chapter is written for action "${action}".`);
      await scenario.world.callTool("edit_file", { action, path: CHAPTER_PATH, ...edit });
    });

    And("the co-author's comment still marks {string}", (_context, quotedText: string) => {
      const { world } = scenario;
      const anchor = world.editor
        .commentAnchors(world.documentIdOf(CHAPTER_PATH))
        .find((comment) => comment.op.t === COMMENT_THREAD_ID);
      expect(anchor?.op.p).toBe(chapterText().indexOf(quotedText));
    });

    And("the chapter holds no suggestions", () => {
      expect(scenario.world.trackedChangesIn(CHAPTER_PATH)).toHaveLength(0);
    });

    And("the chapter is unchanged", () => {
      expect(chapterText()).toBe(CHAPTER);
    });

    Then("the chapter is {string}", (_context, outcome: string) => {
      const { lastReply } = scenario.world;
      if (outcome === "changed") {
        expect(lastReply.isError, lastReply.text).toBe(false);
        expect(chapterText()).not.toBe(CHAPTER);
        return;
      }
      const refusal = REFUSALS[outcome];
      if (!refusal) throw new Error(`Unknown outcome "${outcome}".`);
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(refusal);
      expect(chapterText()).toBe(CHAPTER);
    });
  });

  Background(() => {});

  Scenario("A section is replaced in Overleaf at once, as ordinary text", () => {});
  Scenario("A section that already reads like the new content changes nothing", () => {});
  Scenario("A section title that matches nothing is refused, listing the titles there are", () => {});
  Scenario("Writing a whole document sends only the passages that differ", () => {});
  Scenario("Writing what a document already holds changes nothing", () => {});
  Scenario("Writing a document that does not exist creates it, with its missing folders", () => {});
  Scenario("Text is not written over an uploaded figure", () => {});
  Scenario("Appending adds the text on a new line at the end", () => {});
  Scenario("Appending to a document that does not exist is refused, pointing at write", () => {});
  ScenarioOutline("Only an account that may edit can rewrite a document", () => {});
  Scenario("A reviewer cannot create a document either", () => {});
  Scenario("A reviewer hears about a wrong section title the same way an editor does", () => {});
});
