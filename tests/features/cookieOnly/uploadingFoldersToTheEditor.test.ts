import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { FolderOnThisComputer } from "../support/folderOnThisComputer.js";
import { OverleafEditorScenario } from "../support/overleafEditorScenario.js";
import { defineSharedEditorSteps } from "../support/sharedEditorSteps.js";

const feature = await loadFeature(
  fileURLToPath(new URL("uploadingFoldersToTheEditor.feature", import.meta.url)),
);
const scenario = new OverleafEditorScenario();

const PLOT_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xfa, 0xce, 0xb0, 0x0c,
]);
const INTRODUCTION = "\\section{Introduction}";
const EDIT_ACCESS_REFUSAL =
  "Overleaf needs edit access to change its files and folders. Nothing was changed.";

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  let computer: FolderOnThisComputer | undefined;

  AfterEachScenario(async () => {
    await scenario.close();
    computer?.remove();
    computer = undefined;
  });

  function folderOnThisComputer(): FolderOnThisComputer {
    if (!computer) throw new Error("No step of this scenario has made a folder on this computer.");
    return computer;
  }

  function uploadsSent(): string[] {
    return scenario.world.web.requests
      .filter((request) => request.method === "POST" && /\/upload$/i.test(request.path))
      .map((request) => request.path);
  }

  function expectPlotAt(path: string): void {
    const { tree } = scenario.world.editor;
    const entity = tree.entityAt(path);
    expect(entity?.type).toBe("file");
    expect(tree.files.get(entity?.id ?? "")?.bytes).toEqual(PLOT_BYTES);
  }

  defineSteps((steps) => {
    defineSharedEditorSteps(steps, scenario);
    const { Given, When, Then, And } = steps;

    And(
      "this computer has a folder {string} holding {string}, {string} and a hidden {string} folder",
      (_context, folder: string, textFile: string, plotFile: string, hiddenFolder: string) => {
        computer = FolderOnThisComputer.create();
        computer.writeFile(`${folder}/${textFile}`, `${INTRODUCTION}\n`);
        computer.writeFile(`${folder}/${plotFile}`, PLOT_BYTES);
        computer.writeFile(`${folder}/${hiddenFolder}/config`, "[core]\n");
      },
    );

    Given("Overleaf takes one more upload before the project holds too many files", () => {
      scenario.world.editor.tree.uploadsLeftBeforeFull = 1;
    });

    When("I upload the folder {string} into {string}", async (_context, folder: string, path: string) => {
      await scenario.world.callTool("manage_files", {
        action: "upload_folder",
        path,
        sourcePath: folderOnThisComputer().pathOf(folder),
      });
    });

    for (const keyword of [Then, And]) {
      keyword(
        "Overleaf holds the document {string} reading {string}",
        (_context, path: string, text: string) => {
          const entity = scenario.world.editor.tree.entityAt(path);
          expect(entity?.type).toBe("doc");
          expect(scenario.world.editor.documentText(entity?.id ?? "")).toBe(`${text}\n`);
        },
      );

      keyword("Overleaf holds the plot byte for byte at {string}", (_context, path: string) => {
        expectPlotAt(path);
      });
    }

    And("Overleaf holds nothing at {string}", (_context, path: string) => {
      const { tree } = scenario.world.editor;
      expect(tree.entityAt(path)).toBeUndefined();
      expect(tree.entityAt(`${path}/config`)).toBeUndefined();
    });

    And("Overleaf was sent no upload", () => {
      expect(uploadsSent()).toEqual([]);
    });

    Then("the folder upload is {string}", (_context, outcome: string) => {
      const { lastReply } = scenario.world;
      if (outcome === "made") {
        expect(lastReply.isError, lastReply.text).toBe(false);
        expectPlotAt("parts/chapter/figures/plot.png");
        return;
      }
      if (outcome !== "refused") throw new Error(`Unknown outcome "${outcome}".`);
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(EDIT_ACCESS_REFUSAL);
      expect(uploadsSent()).toEqual([]);
    });
  });

  Background(() => {});
  Scenario("The folder's files are in Overleaf at once, text as editable documents", () => {});
  Scenario("A document already in Overleaf takes the new text", () => {});
  Scenario("A document where a folder would go stops the upload before anything is sent", () => {});
  Scenario("A project that fills up halfway keeps what was sent, and the reply lists it", () => {});
  ScenarioOutline("Only an account that may edit can upload a folder", () => {});
});
