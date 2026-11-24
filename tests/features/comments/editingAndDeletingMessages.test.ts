import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { KNOWN_BUGS_LEFT_OUT } from "../support/knownBugsLeftOut.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";
import { adasThread, adasThreadIdIn, messagesIn } from "./commentThreadSteps.js";

const feature = await loadFeature(
  fileURLToPath(new URL("editingAndDeletingMessages.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();
const adasThreadId = adasThreadIdIn("main.tex");

/** The fake numbers messages in the order the Background seeds them. */
const MESSAGE_IDS = {
  "Ada's question": "message-1",
  "my reply": "message-2",
  "Ada's follow-up": "message-3",
} as const;

function messageRequests(): string[] {
  return scenario.world.web.requests
    .filter((request) => /\/thread\/[0-9a-f]{24}\/(messages|own-messages)\/[^/]+/.test(request.path))
    .map((request) => `${request.method} ${request.path}`);
}

describeFeature(
  feature,
  ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
    AfterEachScenario(() => scenario.close());

    async function editMessage(messageId: string, message?: string): Promise<void> {
      await scenario.world.callTool("manage_comments", {
        action: "edit_message",
        threadId: adasThreadId,
        messageId,
        message,
      });
    }

    async function deleteMessage(messageId: string): Promise<void> {
      await scenario.world.callTool("manage_comments", {
        action: "delete_message",
        threadId: adasThreadId,
        messageId,
      });
    }

    defineSteps((steps) => {
      defineSharedEditorSteps(steps, scenario);
      const { Given, When, Then, And } = steps;

      And(
        "Ada's thread on {string} holds, in order:",
        (_context, quotedText: string, rows: Array<{ author: string; message: string }>) => {
          const { world } = scenario;
          world.editor.addComment(
            world.mainDocumentId,
            quotedText,
            world.offsetInMainDocument(quotedText),
            adasThreadId,
          );
          world.web.addThread(
            adasThreadId,
            rows.map((row) => ({ author: row.author, content: row.message })),
          );
        },
      );

      Given("Overleaf accepts message changes without keeping them", () => {
        scenario.world.web.ignoreMessageChanges = true;
      });

      When("I read the comments on {string}", async (_context, path: string) => {
        await scenario.world.callTool("read_review", { view: "comments", path });
      });

      When("I edit my reply to read {string}", async (_context, message: string) => {
        await editMessage(MESSAGE_IDS["my reply"], message);
      });

      When("I edit Ada's question to read {string}", async (_context, message: string) => {
        await editMessage(MESSAGE_IDS["Ada's question"], message);
      });

      When(
        "I edit message {string} in Ada's thread to read {string}",
        async (_context, messageId: string, message: string) => {
          await editMessage(messageId, message);
        },
      );

      When("I edit my reply without giving new text", async () => {
        await editMessage(MESSAGE_IDS["my reply"]);
      });

      When("I delete my reply", async () => {
        await deleteMessage(MESSAGE_IDS["my reply"]);
      });

      When("I delete Ada's question", async () => {
        await deleteMessage(MESSAGE_IDS["Ada's question"]);
      });

      When("I delete Ada's follow-up", async () => {
        await deleteMessage(MESSAGE_IDS["Ada's follow-up"]);
      });

      When("I {string} my reply", async (_context, change: string) => {
        if (change === "edit") await editMessage(MESSAGE_IDS["my reply"], "No, make it formal.");
        else if (change === "delete") await deleteMessage(MESSAGE_IDS["my reply"]);
        else throw new Error(`Unknown change "${change}".`);
      });

      Then("my reply is shown as {string}", (_context, listedLine: string) => {
        const lines = scenario.world.lastReply.text.split("\n").map((line) => line.trim());
        expect(lines).toContain(listedLine);
      });

      Then("the reply says my reply was edited and reading the thread again shows the new text", () => {
        expect(scenario.world.lastReply.isError, scenario.world.lastReply.text).toBe(false);
        expect(scenario.world.lastReply.text).toBe(
          `Edited message ${MESSAGE_IDS["my reply"]} in thread ${adasThreadId}; reading the thread again shows the new text.`,
        );
      });

      Then("the reply says my reply was deleted and the thread's other messages stay", () => {
        expect(scenario.world.lastReply.isError, scenario.world.lastReply.text).toBe(false);
        expect(scenario.world.lastReply.text).toBe(
          `Deleted message ${MESSAGE_IDS["my reply"]} by You from thread ${adasThreadId}; reading the thread again confirms it is gone, and the thread's other messages stay.`,
        );
      });

      And(
        "Ada's thread holds {string}, {string} and {string}",
        (_context: unknown, ...expectedMessages: string[]) => {
          expect(messagesIn(adasThread(scenario))).toEqual(expectedMessages);
        },
      );

      And("Ada's thread holds {string} and {string}", (_context: unknown, ...expectedMessages: string[]) => {
        expect(messagesIn(adasThread(scenario))).toEqual(expectedMessages);
      });

      for (const keyword of [Then, And]) {
        keyword("Overleaf was never asked to delete a message", () => {
          expect(messageRequests()).toEqual([]);
        });

        keyword("Overleaf was never asked to change a message", () => {
          expect(messageRequests()).toEqual([]);
        });
      }
    });

    Background(() => {});

    Scenario("Reading the thread shows the id of each message", () => {});
    Scenario("I can rewrite my own message", () => {});
    Scenario("Someone else's message cannot be rewritten", () => {});
    Scenario("Deleting a reply keeps the rest of the thread", () => {});
    Scenario("The message that opens a thread is not deleted on its own", () => {});
    Scenario("With review access, I can delete my own reply but not someone else's", () => {});
    Scenario("A message id that does not exist names the ones that do", () => {});
    ScenarioOutline("A change Overleaf accepts but does not keep is reported as a failure", () => {});
    Scenario("An edit needs the new text", () => {});
  },
  KNOWN_BUGS_LEFT_OUT,
);
