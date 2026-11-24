import type { FeatureDescriibeCallbackParams } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { editorPaper } from "./connectedOverleafEditor.js";
import { parseAccessLevel } from "./overleafAccessLevel.js";
import type { OverleafEditorScenario } from "./overleafEditorScenario.js";
import { parseServerCredentials } from "./serverCredentials.js";

export type StepDefinitions = Parameters<Parameters<FeatureDescriibeCallbackParams["defineSteps"]>[0]>[0];

export function defineSharedEditorSteps(steps: StepDefinitions, scenario: OverleafEditorScenario): void {
  const { Given, And, Then } = steps;

  Given("I am signed in to Overleaf", async () => {
    await scenario.open();
  });

  Given("the server was given {string}", async (_context, credentials: string) => {
    await scenario.open(parseServerCredentials(credentials));
  });

  Given(
    "I am signed in to Overleaf with a paper whose third line reads {string}",
    async (_context, line: string) => {
      const world = await scenario.open();
      expect(world.textOf("main.tex").split("\n")[2]).toBe(line);
    },
  );

  for (const keyword of [Given, And]) {
    keyword(
      "the project has a document {string} reading {string}",
      (_context, path: string, text: string) => {
        scenario.world.addDocument(path, `${text}\n`);
      },
    );

    keyword(
      "the project has a document {string} with {string} on two lines",
      (_context, path: string, line: string) => {
        scenario.world.addDocument(path, `${line}\n${line}\n`);
      },
    );

    keyword("my access to the project is {string}", (_context, access: string) => {
      scenario.world.setAccessLevel(parseAccessLevel(access));
    });

    keyword("my access to the project becomes {string}", (_context, access: string) => {
      scenario.world.setAccessLevel(parseAccessLevel(access));
    });

    keyword(
      "a collaborator has suggested inserting {string} before {string}",
      (_context, inserted: string, before: string) => {
        const { world } = scenario;
        world.editor.collaboratorSuggests(world.mainDocumentId, [
          { p: world.offsetInMainDocument(before), i: inserted },
        ]);
      },
    );
  }

  for (const keyword of [Then, And]) {
    keyword("the reply says {string}", (_context, expected: string) => {
      expect(scenario.world.lastReply.text).toContain(expected);
    });

    keyword("the reply is not an error", () => {
      expect(scenario.world.lastReply.isError, scenario.world.lastReply.text).toBe(false);
    });

    keyword("the reply is an error", () => {
      expect(scenario.world.lastReply.isError, scenario.world.lastReply.text).toBe(true);
    });

    keyword("the paper is unchanged", () => {
      expect(scenario.world.textOf("main.tex")).toBe(editorPaper);
    });
  }
}
