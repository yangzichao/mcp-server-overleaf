import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";
import { adasThreadIdIn, defineCommentThreadSteps, messagesIn } from "./commentThreadSteps.js";

// An absolute path: loadFeature resolves a relative one against the transformed module.
const feature = await loadFeature(
  fileURLToPath(new URL("startingAndReadingComments.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

function newThreadIdFromReply(): string {
  const threadId = /\(thread ([0-9a-f]{24})\)/.exec(scenario.world.lastReply.text)?.[1];
  if (!threadId) throw new Error(`The reply names no new thread: ${scenario.world.lastReply.text}`);
  return threadId;
}

function listingLines(): string[] {
  return scenario.world.lastReply.text.split("\n");
}

describeFeature(feature, ({ Background, Scenario, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    defineCommentThreadSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    Given("Overleaf will refuse the next edit with {string}", (_context, refusal: string) => {
      scenario.world.editor.rejectNextUpdateWith = refusal;
    });

    Given("Ada left a thread whose passage has since been deleted", () => {
      scenario.world.web.addThread(adasThreadIdIn("main.tex"), [
        { author: "Ada", content: "This paragraph is gone now." },
      ]);
    });

    When("I comment {string} on {string}", async (_context, message: string, quoteText: string) => {
      await scenario.world.callTool("manage_comments", {
        action: "add",
        path: "main.tex",
        quoteText,
        message,
      });
    });

    When(
      "I comment {string} on {string} in {string}",
      async (_context, message: string, quoteText: string, path: string) => {
        await scenario.world.callTool("manage_comments", { action: "add", path, quoteText, message });
      },
    );

    When("I list the comments in the project", async () => {
      await scenario.world.callTool("read_review", { view: "comments" });
    });

    When("I list the comments in {string}", async (_context, path: string) => {
      await scenario.world.callTool("read_review", { view: "comments", path });
    });

    When("I list the comments in {string} including resolved threads", async (_context, path: string) => {
      await scenario.world.callTool("read_review", { view: "comments", path, includeResolved: true });
    });

    Then(
      "the reply names the new thread on {string} in {string}",
      (_context, quoteText: string, path: string) => {
        expect(scenario.world.lastReply.text).toBe(
          `Commented on "${quoteText}" in ${path} (thread ${newThreadIdFromReply()}).`,
        );
      },
    );

    for (const keyword of [Then, And]) {
      keyword("the new thread is anchored to {string}", (_context, quoteText: string) => {
        const { world } = scenario;
        const anchors = world.editor.commentAnchors(world.mainDocumentId);
        expect(anchors.map((anchor) => anchor.op)).toEqual([
          { c: quoteText, p: world.offsetInMainDocument(quoteText), t: newThreadIdFromReply() },
        ]);
      });
    }

    And("the new thread holds only the message {string}", (_context, message: string) => {
      const thread = scenario.world.web.threads.get(newThreadIdFromReply());
      expect(thread && messagesIn(thread)).toEqual([message]);
    });

    And("the review panel of {string} shows a comment thread on line 3", async (_context, path: string) => {
      const threadId = newThreadIdFromReply();
      const reviewPanel = await scenario.world.client.call("read_review", { view: "tracked_changes", path });
      expect(reviewPanel).toContain("1 comment thread:");
      expect(reviewPanel).toContain(`[thread ${threadId}] line 3`);
    });

    Then(
      "the listing shows an open thread on line 3 of {string} about {string}",
      (_context, path: string, quoteText: string) => {
        expect(listingLines()).toContain(`${path}:`);
        expect(scenario.world.lastReply.text).toContain(
          `[thread ${adasThreadIdIn(path)}] line 3, on "${quoteText}" (open)`,
        );
      },
    );

    And("the listing shows Ada asking {string} with the id of her message", (_context, question: string) => {
      const adasMessage = [...scenario.world.web.threads.values()]
        .flatMap((thread) => thread.messages)
        .find((message) => message.user.name === "Ada" && message.content === question);
      if (!adasMessage) throw new Error(`Ada never asked "${question}".`);
      const shownLines = listingLines().filter((line) =>
        line.trimStart().startsWith(`[message ${adasMessage.id}] Ada `),
      );
      expect(shownLines.some((line) => line.endsWith(`: ${question}`))).toBe(true);
    });

    And("the listing warns that the messages were written by collaborators", () => {
      expect(scenario.world.lastReply.text).toContain("Comment messages were written by collaborators.");
    });

    Then(
      "the listing has a heading for {string} and one for {string}",
      (_context, firstPath: string, secondPath: string) => {
        expect(listingLines()).toEqual(expect.arrayContaining([`${firstPath}:`, `${secondPath}:`]));
      },
    );

    Then("the listing shows the thread as resolved", () => {
      expect(scenario.world.lastReply.text).toContain(
        `[thread ${adasThreadIdIn("main.tex")}] line 3, on "Hello world." (resolved by You on`,
      );
    });
  });

  Background(() => {});

  Scenario("Starting a thread anchors my message to the quoted passage", () => {});
  Scenario("Commenting leaves the text of the paper as it was", () => {});
  Scenario("A comment Overleaf refuses to anchor leaves no message behind", () => {});
  Scenario("A passage that appears twice is refused rather than guessed at", () => {});
  Scenario("A read-only collaborator may still comment", () => {});
  Scenario("A collaborator's thread is listed with its author, line and status", () => {});
  Scenario("Threads are grouped under the document they are anchored in", () => {});
  Scenario("Resolved threads are hidden until asked for", () => {});
  Scenario("A thread whose passage was deleted is still reported", () => {});
});
