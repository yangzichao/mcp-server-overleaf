import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { FolderOnThisComputer } from "../support/folderOnThisComputer.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const LOSS_PLOT_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xca, 0xfe, 0xba, 0xbe,
]);
const PLOT_FILES: Readonly<Record<string, string | Buffer>> = {
  "loss.png": LOSS_PLOT_BYTES,
  "data/raw.csv": "x,y\n1,2\n",
};

const feature = await loadFeature(fileURLToPath(new URL("uploadingFolders.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let computer: FolderOnThisComputer;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
    computer.remove();
  });

  async function uploadFolder(sourcePath: string, path: string): Promise<void> {
    lastReply = await callTool(project.client, "manage_files", { action: "upload_folder", path, sourcePath });
  }

  function unsafeUpload(description: string): { sourcePath: string; path: string } {
    switch (description) {
      case "a hidden folder such as ~/.ssh":
        computer.writeFile(".ssh/id_ed25519", "not really a key");
        return { sourcePath: computer.pathOf(".ssh"), path: "keys" };
      case "from a relative source path":
        return { sourcePath: "plots", path: "figures" };
      case "a file instead of a folder":
        return { sourcePath: computer.pathOf("plots/loss.png"), path: "figures" };
      case "a folder holding only hidden files":
        computer.writeFile("settings/.env", "TOKEN=1");
        computer.writeFile("settings/.cache/state", "");
        return { sourcePath: computer.pathOf("settings"), path: "settings" };
      case "a folder holding 181 files":
        for (let index = 0; index < 181; index += 1) computer.writeFile(`frames/frame-${index}.png`, "png");
        return { sourcePath: computer.pathOf("frames"), path: "frames" };
      case "a folder with a name Overleaf refuses":
        computer.writeFile("plots/a*b.png", "png");
        return { sourcePath: computer.pathOf("plots"), path: "figures" };
      case "the folder into the clone's .git":
        return { sourcePath: computer.pathOf("plots"), path: ".git/hooks" };
      case "the folder into a path outside the project":
        return { sourcePath: computer.pathOf("plots"), path: "../outside" };
      default:
        throw new Error(`No unsafe folder upload described as "${description}"`);
    }
  }

  async function filesOverleafHoldsUnder(folder: string): Promise<string[]> {
    return (await project.remote.listPublishedFiles()).filter((path) => path.startsWith(`${folder}/`)).sort();
  }

  defineSteps(({ Step }) => {
    Step(
      "the folder {string} also holds a hidden {string} and a link {string} to a file outside it",
      (_context: unknown, folder: string, hiddenName: string, linkName: string) => {
        computer.writeFile(`${folder}/${hiddenName}`, "SECRET=1");
        computer.writeFile("outside/shared.png", "png");
        computer.linkTo(`${folder}/${linkName}`, computer.pathOf("outside/shared.png"));
      },
    );

    Step(
      "the folder {string} also holds {string} reading {string}",
      (_context: unknown, folder: string, fileName: string, text: string) => {
        computer.writeFile(`${folder}/${fileName}`, text);
      },
    );

    Step("the co-author has published {string}", async (_context: unknown, path: string) => {
      await project.remote.collaboratorPushes(path, "png", `Add ${path}`);
    });

    Step(
      "I upload the folder {string} into {string}",
      async (_context: unknown, folder: string, path: string) => {
        await uploadFolder(computer.pathOf(folder), path);
      },
    );

    Step("I push the work as {string}", async (_context: unknown, commitMessage: string) => {
      lastReply = await callTool(project.client, "push_changes", { commitMessage });
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.text).toContain(expected);
    });

    Step("the copy is refused with {string}", (_context: unknown, reason: string) => {
      expect(lastReply.isError, lastReply.text).toBe(true);
      expect(lastReply.text).toContain(reason);
    });

    Step("there is nothing pending", async () => {
      expect(await project.client.call("read_project", { view: "changes" })).toBe(
        "No local changes pending.",
      );
    });

    Step("Overleaf does not hold {string} yet", async (_context: unknown, path: string) => {
      expect(await project.remote.listPublishedFiles()).not.toContain(path);
    });

    Step(
      "Overleaf holds every file of {string} byte for byte under {string}",
      async (_context: unknown, folder: string, destination: string) => {
        expect(lastReply.isError, lastReply.text).toBe(false);
        for (const relativePath of Object.keys(PLOT_FILES)) {
          expect(await project.remote.readPublishedBytes(`${destination}/${relativePath}`)).toEqual(
            computer.readBytes(`${folder}/${relativePath}`),
          );
        }
      },
    );

    Step(
      "the files Overleaf holds under {string} are {string} and {string}",
      async (_context: unknown, folder: string, first: string, second: string) => {
        expect(lastReply.isError, lastReply.text).toBe(false);
        expect(await filesOverleafHoldsUnder(folder)).toEqual([first, second]);
      },
    );

    Step("{string} reads back {string}", async (_context: unknown, path: string, text: string) => {
      expect(await project.client.call("read_file", { path })).toBe(text);
    });
  });

  Background(({ Given, And }) => {
    Given("the co-author has published a paper and shared notes", async () => {
      project = await ConnectedOverleafProject.open();
    });
    And(
      "this computer has a folder {string} holding {string} and {string}",
      (_context: unknown, folder: string, first: string, second: string) => {
        computer = FolderOnThisComputer.create();
        for (const relativePath of [first, second]) {
          const content = PLOT_FILES[relativePath];
          if (content === undefined) throw new Error(`No plot file "${relativePath}" is defined.`);
          computer.writeFile(`${folder}/${relativePath}`, content);
        }
      },
    );
  });

  Scenario("A folder reaches Overleaf with its subfolders, once pushed", () => {});
  Scenario("Hidden files and symbolic links stay on this computer", () => {});
  Scenario(`"." copies into the project's root folder and replaces a file already there`, () => {});
  Scenario("A file where a folder would go stops the whole copy", () => {});
  Scenario("A folder where a file would go stops the whole copy", () => {});

  ScenarioOutline(
    "A folder upload that cannot be done safely is refused and changes nothing",
    ({ When, Then, And }, variables) => {
      When("I upload <unsafe folder>", async () => {
        const { sourcePath, path } = unsafeUpload(variables["unsafe folder"]);
        await uploadFolder(sourcePath, path);
      });
      Then(`the copy is refused with "<reason>"`, () => {
        expect(lastReply.isError, lastReply.text).toBe(true);
        expect(lastReply.text).toContain(variables.reason);
      });
      And("there is nothing pending", async () => {
        expect(await project.client.call("read_project", { view: "changes" })).toBe(
          "No local changes pending.",
        );
      });
    },
  );
});
