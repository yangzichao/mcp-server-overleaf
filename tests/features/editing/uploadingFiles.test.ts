import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { ConnectedOverleafProject } from "../support/connectedOverleafProject.js";
import { callTool, type ToolReply } from "../support/toolReply.js";

const figureBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xde, 0xad, 0xbe, 0xef,
]);

const feature = await loadFeature(fileURLToPath(new URL("uploadingFiles.feature", import.meta.url)));

describeFeature(feature, ({ Background, Scenario, ScenarioOutline, AfterEachScenario, defineSteps }) => {
  let project: ConnectedOverleafProject;
  let computerDirectory: string;
  let lastReply: ToolReply;

  AfterEachScenario(async () => {
    await project.close();
    rmSync(computerDirectory, { recursive: true, force: true });
  });

  function hiddenKeyFile(): string {
    const hiddenDirectory = join(computerDirectory, ".ssh");
    mkdirSync(hiddenDirectory);
    writeFileSync(join(hiddenDirectory, "id_ed25519"), "not really a key");
    return join(hiddenDirectory, "id_ed25519");
  }

  function unsafeUploadArguments(description: string): Record<string, unknown> {
    const figurePath = join(computerDirectory, "plot.png");
    switch (description) {
      case "a key file from a hidden folder":
        return { action: "upload", path: "key.txt", sourcePath: hiddenKeyFile() };
      case "from a relative source path":
        return { action: "upload", path: "figures/plot.png", sourcePath: "plot.png" };
      case "with both a source path and base64 content":
        return { action: "upload", path: "figures/plot.png", sourcePath: figurePath, contentBase64: "AA==" };
      case "base64 content that does not decode":
        return { action: "upload", path: "figures/plot.png", contentBase64: "not base64!" };
      case "the figure to a path outside the project":
        return { action: "upload", path: "../outside.png", sourcePath: figurePath };
      default:
        throw new Error(`No unsafe upload described as "${description}"`);
    }
  }

  async function expectNothingPending(): Promise<void> {
    expect(await project.client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
  }

  defineSteps(({ Step }) => {
    Step(
      "I upload {string} from this computer as {string}",
      async (_context: unknown, fileName: string, path: string) => {
        lastReply = await callTool(project.client, "manage_files", {
          action: "upload",
          path,
          sourcePath: join(computerDirectory, fileName),
        });
      },
    );

    Step(
      "I upload base64 content {string} as {string}",
      async (_context: unknown, text: string, path: string) => {
        lastReply = await callTool(project.client, "manage_files", {
          action: "upload",
          path,
          contentBase64: Buffer.from(text).toString("base64"),
        });
      },
    );

    Step("I push the work as {string}", async (_context: unknown, commitMessage: string) => {
      lastReply = await callTool(project.client, "push_changes", { commitMessage });
    });

    Step("the reply says {string}", (_context: unknown, expected: string) => {
      expect(lastReply.text).toContain(expected);
    });

    Step("Overleaf does not hold {string} yet", async (_context: unknown, path: string) => {
      expect(await project.remote.listPublishedFiles()).not.toContain(path);
    });

    Step("Overleaf holds the figure's exact bytes at {string}", async (_context: unknown, path: string) => {
      expect(await project.remote.readPublishedBytes(path)).toEqual(figureBytes);
    });

    Step("{string} reads back {string}", async (_context: unknown, path: string, text: string) => {
      expect(await project.client.call("read_file", { path })).toBe(text);
    });
  });

  Background(({ Given, And }) => {
    Given("the co-author has published a paper and shared notes", async () => {
      project = await ConnectedOverleafProject.open();
    });
    And("this computer has a figure {string}", (_context: unknown, fileName: string) => {
      computerDirectory = mkdtempSync(join(tmpdir(), "overleaf-feature-upload-"));
      writeFileSync(join(computerDirectory, fileName), figureBytes);
    });
  });

  Scenario("An uploaded figure reaches Overleaf unchanged, once pushed", () => {});
  Scenario("Uploaded content replaces a file that already exists", () => {});

  ScenarioOutline("An unsafe upload is refused", ({ When, Then, And }, variables) => {
    When("I upload <unsafe upload>", async () => {
      lastReply = await callTool(
        project.client,
        "manage_files",
        unsafeUploadArguments(variables["unsafe upload"]),
      );
    });
    Then(`the upload is refused with "<reason>"`, () => {
      expect(lastReply.isError).toBe(true);
      expect(lastReply.text).toContain(variables.reason);
    });
    And("there is nothing pending", expectNothingPending);
  });
});
