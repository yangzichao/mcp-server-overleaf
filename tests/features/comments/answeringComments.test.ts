import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";
import {
  adasThread,
  adasThreadIdIn,
  defineCommentThreadSteps,
  messagesIn,
  THREAD_ID_NOBODY_STARTED,
} from "./commentThreadSteps.js";

const feature = await loadFeature(fileURLToPath(new URL("answeringComments.feature", import.meta.url)));
const scenario = new OverleafEditorScenario();
const adasThreadId = adasThreadIdIn("main.tex");

const THREAD_ACTIONS: Record<string, { toolName: string; toolArguments: Record<string, unknown> }> = {
  list: { toolName: "read_review", toolArguments: { view: "comments" } },
  "reply to": {
    toolName: "manage_comments",
    toolArguments: { action: "reply", threadId: adasThreadId, message: "Hello?" },
  },
  resolve: { toolName: "manage_comments", toolArguments: { action: "resolve", threadId: adasThreadId } },
  delete: { toolName: "manage_comments", toolArguments: { action: "delete", threadId: adasThreadId } },
};

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    defineCommentThreadSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    And("Overleaf has issued a new CSRF token since", () => {
      scenario.world.web.rotateCsrfToken();
    });

    Given("Overleaf no longer recognises the session cookie", () => {
      scenario.world.web.sessionExpired = true;
    });

    When("I reply {string} in Ada's thread", async (_context, message: string) => {
      await scenario.world.callTool("manage_comments", { action: "reply", threadId: adasThreadId, message });
    });

    When("I reply {string} in a thread that does not exist", async (_context, message: string) => {
      await scenario.world.callTool("manage_comments", {
        action: "reply",
        threadId: THREAD_ID_NOBODY_STARTED,
        message,
      });
    });

    When("I reply {string} in the thread {string}", async (_context, message: string, threadId: string) => {
      await scenario.world.callTool("manage_comments", { action: "reply", threadId, message });
    });

    When("I resolve Ada's thread", async () => {
      await scenario.world.callTool("manage_comments", { action: "resolve", threadId: adasThreadId });
    });

    When("I reopen Ada's thread", async () => {
      await scenario.world.callTool("manage_comments", { action: "reopen", threadId: adasThreadId });
    });

    When("I resolve Ada's thread in {string} without naming the document", async (_context, path: string) => {
      await scenario.world.callTool("manage_comments", { action: "resolve", threadId: adasThreadIdIn(path) });
    });

    When("I delete Ada's thread", async () => {
      await scenario.world.callTool("manage_comments", { action: "delete", threadId: adasThreadId });
    });

    When("I resolve a thread that does not exist", async () => {
      await scenario.world.callTool("manage_comments", {
        action: "resolve",
        threadId: THREAD_ID_NOBODY_STARTED,
      });
    });

    When("I delete a thread that does not exist", async () => {
      await scenario.world.callTool("manage_comments", {
        action: "delete",
        threadId: THREAD_ID_NOBODY_STARTED,
      });
    });

    When("I {string} Ada's thread", async (_context, action: string) => {
      const chosen = THREAD_ACTIONS[action];
      if (!chosen) throw new Error(`Unknown thread action "${action}".`);
      await scenario.world.callTool(chosen.toolName, chosen.toolArguments);
    });

    Then("the reply confirms the message went into Ada's thread", () => {
      expect(scenario.world.lastReply.text).toBe(`Replied in thread ${adasThreadId}.`);
    });

    And("Ada's thread holds {string} then {string}", (_context, first: string, second: string) => {
      expect(messagesIn(adasThread(scenario))).toEqual([first, second]);
    });

    And("Ada's thread holds only {string}", (_context, message: string) => {
      expect(messagesIn(adasThread(scenario))).toEqual([message]);
    });

    Then("the reply says there is no such comment thread in this project", () => {
      expect(scenario.world.lastReply.text).toContain(
        `No comment thread ${THREAD_ID_NOBODY_STARTED} in this project.`,
      );
    });

    And("Ada's thread is the only thread in the project", () => {
      expect([...scenario.world.web.threads.keys()]).toEqual([adasThreadId]);
    });

    Then(
      "the reply says Ada's thread on {string} in {string} was resolved",
      (_context, quoteText: string, path: string) => {
        expect(scenario.world.lastReply.text).toBe(
          `Resolved thread ${adasThreadId} on "${quoteText}" in ${path}.`,
        );
      },
    );

    Then(
      "the reply says that thread on {string} in {string} was resolved",
      (_context, quoteText: string, path: string) => {
        expect(scenario.world.lastReply.text).toBe(
          `Resolved thread ${adasThreadIdIn(path)} on "${quoteText}" in ${path}.`,
        );
        expect(adasThread(scenario, path).resolved).toBe(true);
      },
    );

    And("Ada's thread is resolved", () => {
      expect(adasThread(scenario).resolved).toBe(true);
    });

    for (const keyword of [Then, And]) {
      keyword("Ada's thread is open", () => {
        expect(adasThread(scenario).resolved).toBeUndefined();
      });
    }

    Then("the reply says Ada's thread was reopened", () => {
      expect(scenario.world.lastReply.text).toContain(`Reopened thread ${adasThreadId}`);
    });

    Then("the reply says Ada's thread was deleted with all its messages", () => {
      expect(scenario.world.lastReply.text).toContain(`Deleted thread ${adasThreadId}`);
      expect(scenario.world.lastReply.text).toContain("with all its messages");
    });

    Then("the reply says the thread is not anchored in any document and names read_review", () => {
      const { text } = scenario.world.lastReply;
      expect(text).toContain(`No comment thread ${THREAD_ID_NOBODY_STARTED} is anchored in any document`);
      expect(text).toContain("read_review (view comments)");
    });

    Then("the reply asks for a fresh overleaf_session2 cookie", () => {
      const { lastReply } = scenario.world;
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain("did not accept the session cookie");
      expect(lastReply.text).toContain("fresh overleaf_session2 cookie");
    });
  });

  Background(() => {});

  Scenario("A reply is added after the earlier messages", () => {});
  Scenario("Replying to a thread that does not exist creates nothing", () => {});
  Scenario("A thread id of the wrong shape is refused before anything is sent", () => {});
  Scenario("Resolving a thread keeps its messages", () => {});
  Scenario("A resolved thread can be reopened", () => {});
  Scenario("A thread in another document is found without naming the document", () => {});
  Scenario("Deleting a thread removes its anchor and every message", () => {});
  Scenario("Resolving a thread that is not anchored anywhere points to read_review", () => {});
  Scenario("Deleting a thread that is not anchored anywhere deletes nothing", () => {});
  Scenario("A change still goes through after Overleaf issues a new CSRF token", () => {});
  ScenarioOutline("An expired session asks for a fresh cookie instead of failing obscurely", () => {});
});
