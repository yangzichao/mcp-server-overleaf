import { expect } from "vitest";

import { FAKE_FIGURE_BYTES } from "../../integration/fakeWebRoutes/fakeProjectTree.js";
import type { ConnectedOverleafEditor } from "./connectedOverleafEditor.js";
import type { OverleafEditorScenario } from "./overleafEditorScenario.js";
import type { StepDefinitions } from "./sharedEditorSteps.js";

export interface WrittenLine {
  readonly line: string;
}

/** A Gherkin table of lines, as a document's text ending in a newline. */
export function textOfLines(rows: readonly WrittenLine[]): string {
  return `${rows.map((row) => row.line).join("\n")}\n`;
}

/** What Overleaf holds at a path now, found by path so documents created by the server count too. */
export function editorDocumentTextAt(world: ConnectedOverleafEditor, path: string): string {
  const entity = world.editor.tree.entityAt(path);
  if (entity?.type !== "doc") throw new Error(`Overleaf holds no editable document at "${path}".`);
  return world.editor.documentText(entity.id);
}

/** Steps for the editor-backed tools that look at, or change, what Overleaf holds. */
export function defineEditorProjectSteps(steps: StepDefinitions, scenario: OverleafEditorScenario): void {
  const { Given, When, Then, And, But } = steps;

  for (const keyword of [Given, And]) {
    keyword("Overleaf's menu names {string} as the main document", (_context, path: string) => {
      scenario.world.editor.rootDocumentId = scenario.world.documentIdOf(path);
    });
  }

  for (const keyword of [When, And]) {
    keyword(
      "I replace {string} with {string} in {string}",
      async (_context, findText: string, replaceWith: string, path: string) => {
        await scenario.world.callTool("edit_file", { action: "replace_text", path, findText, replaceWith });
        expect(scenario.world.lastReply.isError, scenario.world.lastReply.text).toBe(false);
      },
    );
  }

  for (const keyword of [Then, And]) {
    keyword("Overleaf's copy of {string} reads:", (_context, path: string, rows: WrittenLine[]) => {
      const lines = editorDocumentTextAt(scenario.world, path).replace(/\n$/, "").split("\n");
      expect(lines).toEqual(rows.map((row) => row.line));
    });
  }

  And("{string} is still the uploaded figure", (_context, path: string) => {
    const { tree } = scenario.world.editor;
    const figure = tree.entityAt(path);
    expect(figure?.type).toBe("file");
    expect(tree.files.get(figure?.id ?? "")?.bytes).toEqual(FAKE_FIGURE_BYTES);
  });

  for (const keyword of [Then, And, But]) {
    keyword("{string} is not in the project", (_context, path: string) => {
      expect(scenario.world.editor.tree.entityAt(path)).toBeUndefined();
    });
  }
}
