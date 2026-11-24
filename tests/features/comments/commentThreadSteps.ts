import { expect } from "vitest";

import type { FakeThread } from "../../integration/fakeOverleafWeb.js";
import type { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import type { StepDefinitions } from "../support/sharedEditorSteps.js";

const ADAS_THREAD_IDS: Record<string, string> = {
  "main.tex": "aaaaaaaaaaaaaaaaaa000001",
  "sections/intro.tex": "aaaaaaaaaaaaaaaaaa000002",
};

export const THREAD_ID_NOBODY_STARTED = "bbbbbbbbbbbbbbbbbb000009";

export function adasThreadIdIn(path: string): string {
  const threadId = ADAS_THREAD_IDS[path];
  if (!threadId) throw new Error(`Ada never comments in "${path}".`);
  return threadId;
}

export function adasThread(scenario: OverleafEditorScenario, path = "main.tex"): FakeThread {
  const thread = scenario.world.web.threads.get(adasThreadIdIn(path));
  if (!thread) throw new Error(`Ada's thread in ${path} no longer exists.`);
  return thread;
}

export function messagesIn(thread: FakeThread): string[] {
  return thread.messages.map((message) => message.content);
}

export function defineCommentThreadSteps(steps: StepDefinitions, scenario: OverleafEditorScenario): void {
  const { Given, And, Then } = steps;

  function adaAsks(question: string, quotedText: string, path: string): void {
    const { world } = scenario;
    const documentId = world.documentIdOf(path);
    const threadId = adasThreadIdIn(path);
    const position = world.editor.documentText(documentId).indexOf(quotedText);
    expect(position, `"${quotedText}" is in ${path}`).toBeGreaterThanOrEqual(0);
    world.editor.addComment(documentId, quotedText, position, threadId);
    world.web.addThread(threadId, [{ author: "Ada", content: question }]);
  }

  for (const keyword of [Given, And]) {
    keyword("Ada has asked {string} about {string}", (_context, question: string, quotedText: string) => {
      adaAsks(question, quotedText, "main.tex");
    });

    keyword(
      "Ada has asked {string} about {string} in {string}",
      (_context, question: string, quotedText: string, path: string) => {
        adaAsks(question, quotedText, path);
      },
    );

    keyword("Ada's thread has been resolved", async () => {
      const reply = await scenario.world.callTool("manage_comments", {
        action: "resolve",
        threadId: adasThreadIdIn("main.tex"),
      });
      expect(reply.isError, reply.text).toBe(false);
    });
  }

  for (const keyword of [Then, And]) {
    keyword("Overleaf holds no comment threads", () => {
      const { world } = scenario;
      expect(world.web.threads.size).toBe(0);
      expect(world.editor.commentAnchors(world.mainDocumentId)).toHaveLength(0);
    });
  }
}
