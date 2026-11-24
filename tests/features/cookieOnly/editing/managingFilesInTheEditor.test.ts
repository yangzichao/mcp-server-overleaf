import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { FAKE_FIGURE_BYTES } from "../../../integration/fakeWebRoutes/fakeProjectTree.js";
import { SMALL_PNG } from "../../../integration/support/testImages.js";
import { defineEditorProjectSteps, editorDocumentTextAt } from "../../support/editorProjectSteps.js";
import { OverleafEditorScenario } from "../../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../../support/sharedEditorSteps.js";

const feature = await loadFeature(
  fileURLToPath(new URL("managingFilesInTheEditor.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

const FIGURE_PATH = "figure.png";

interface FileTreeChange {
  readonly toolArguments: Record<string, unknown>;
  readonly happened: () => boolean;
}

function uploadedBytesAt(path: string): Buffer | undefined {
  const { tree } = scenario.world.editor;
  const entity = tree.entityAt(path);
  return entity?.type === "file" ? tree.files.get(entity.id)?.bytes : undefined;
}

const CHANGES_AROUND_THE_FIGURE: Record<string, FileTreeChange> = {
  delete: {
    toolArguments: { path: FIGURE_PATH },
    happened: () => scenario.world.editor.tree.entityAt(FIGURE_PATH) === undefined,
  },
  move: {
    toolArguments: { path: FIGURE_PATH, toPath: "plot.png" },
    happened: () => scenario.world.editor.tree.entityAt("plot.png")?.type === "file",
  },
  upload: {
    toolArguments: { path: FIGURE_PATH, contentBase64: SMALL_PNG.toString("base64") },
    happened: () => uploadedBytesAt(FIGURE_PATH)?.equals(SMALL_PNG) === true,
  },
  create_folder: {
    toolArguments: { path: "figures" },
    happened: () => scenario.world.editor.tree.entityAt("figures")?.type === "folder",
  },
};

function fileTreeChange(action: string): FileTreeChange {
  const change = CHANGES_AROUND_THE_FIGURE[action];
  if (!change) throw new Error(`No change around the figure is written for action "${action}".`);
  return change;
}

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  AfterEachScenario(() => scenario.close());

  let figureOnThisComputer = "";
  let changeAroundTheFigure: FileTreeChange | undefined;

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    defineEditorProjectSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    Given("a figure {string} on this computer", (_context, fileName: string) => {
      figureOnThisComputer = scenario.world.downloadFolder.pathOf(fileName);
      writeFileSync(figureOnThisComputer, SMALL_PNG);
    });

    When("I delete {string}", async (_context, path: string) => {
      await scenario.world.callTool("manage_files", { action: "delete", path });
    });

    When("I move {string} to {string}", async (_context, path: string, toPath: string) => {
      await scenario.world.callTool("manage_files", { action: "move", path, toPath });
    });

    When("I upload {string} holding the line {string}", async (_context, path: string, line: string) => {
      const contentBase64 = Buffer.from(`${line}\n`).toString("base64");
      await scenario.world.callTool("manage_files", { action: "upload", path, contentBase64 });
    });

    When("I upload it to {string}", async (_context, path: string) => {
      await scenario.world.callTool("manage_files", {
        action: "upload",
        path,
        sourcePath: figureOnThisComputer,
      });
    });

    When("I create the folder {string}", async (_context, path: string) => {
      await scenario.world.callTool("manage_files", { action: "create_folder", path });
    });

    When("I use manage_files's action {string} on the uploaded figure", async (_context, action: string) => {
      changeAroundTheFigure = fileTreeChange(action);
      await scenario.world.callTool("manage_files", { action, ...changeAroundTheFigure.toolArguments });
    });

    When(
      "I use manage_files's action {string} on {string}",
      async (_context, action: string, path: string) => {
        await scenario.world.callTool("manage_files", { action, path });
      },
    );

    And("{string} still reads {string}", (_context, path: string, line: string) => {
      expect(editorDocumentTextAt(scenario.world, path)).toBe(`${line}\n`);
    });

    And("the document that was {string} is now at {string}", (_context, oldPath: string, newPath: string) => {
      const { world } = scenario;
      const documentId = world.documentIdOf(oldPath);
      expect(world.editor.documentPath(documentId)).toBe(newPath);
      expect(world.editor.tree.entityAt(newPath)).toEqual({ type: "doc", id: documentId });
    });

    And("Overleaf holds {string} byte for byte as the figure on this computer", (_context, path: string) => {
      expect(uploadedBytesAt(path)).toEqual(readFileSync(figureOnThisComputer));
    });

    And("{string} is a folder in the project", (_context, path: string) => {
      expect(scenario.world.editor.tree.entityAt(path)?.type).toBe("folder");
    });

    Then("the file tree is {string}", (_context, outcome: string) => {
      const { lastReply } = scenario.world;
      if (outcome === "changed") {
        expect(lastReply.isError, lastReply.text).toBe(false);
        expect(changeAroundTheFigure?.happened()).toBe(true);
        return;
      }
      const accessName = outcome.replace(/^refused: /, "");
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toBe(
        `This account's access to the project is "${accessName}", and Overleaf needs edit access to change its files and folders. Nothing was changed.`,
      );
      expect(uploadedBytesAt(FIGURE_PATH)).toEqual(FAKE_FIGURE_BYTES);
      expect(scenario.world.editor.tree.entityAt("plot.png")).toBeUndefined();
      expect(scenario.world.editor.tree.entityAt("figures")).toBeUndefined();
    });
  });

  Background(() => {});

  Scenario("Deleting a document removes it from Overleaf at once", () => {});
  Scenario("Deleting a folder deletes everything in it and names what went", () => {});
  Scenario("Deleting something that is not in the project deletes nothing", () => {});
  Scenario("Deleting the main document says to choose another before compiling", () => {});
  Scenario("Moving a document renames it and keeps the document itself", () => {});
  Scenario("Moving a folder moves everything in it", () => {});
  Scenario("Moving onto a path that is taken is refused and keeps both", () => {});
  Scenario("Moving something that is not in the project is refused", () => {});
  Scenario("An uploaded text file becomes an editable document", () => {});
  Scenario("A figure on this computer is uploaded byte for byte as a binary file", () => {});
  Scenario("Uploading over an uploaded figure replaces it", () => {});
  Scenario("Uploading onto a folder is refused", () => {});
  Scenario("Creating a folder creates its missing parent folders too", () => {});
  Scenario("Creating a folder that already exists creates nothing", () => {});
  ScenarioOutline("Only an account that may edit can change the file tree", () => {});
  ScenarioOutline("The actions that work on a local clone are not offered", () => {});
});
