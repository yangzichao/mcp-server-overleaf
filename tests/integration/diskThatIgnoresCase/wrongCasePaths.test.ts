import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { temporaryDiskIgnoresCase } from "../../support/temporaryDiskIgnoresCase.js";
import { FakeOverleafRemote } from "../fakeOverleafRemote.js";
import { McpStdioClient } from "../mcpStdioClient.js";
import { responseText } from "../support/mcpProtocol.js";

const MAIN_TEX = "\\documentclass{article}\n";

function refusalNaming(misspelled: string, stored: string, wholePathAsStored: string): string {
  return (
    `${misspelled} is not in the project, but ${stored} is, ` +
    "and this computer's disk does not tell names that differ only in case apart. " +
    `Use ${wholePathAsStored}, or choose a name that differs in more than case.`
  );
}

/**
 * On a disk that ignores case, as macOS does by default, Main.tex opens main.tex. Overleaf keeps
 * the two apart, so each of these used to act on main.tex under a reply that named Main.tex.
 */
describe.runIf(temporaryDiskIgnoresCase())(
  "a path that differs only in case from what the clone holds",
  () => {
    let remote: FakeOverleafRemote;
    let client: McpStdioClient;

    beforeEach(async () => {
      remote = await FakeOverleafRemote.create();
      await remote.collaboratorPushes("main.tex", MAIN_TEX, "Initial draft");
      await remote.collaboratorPushes("sections/intro.tex", "\\section{Intro}\n", "Intro");
      client = await McpStdioClient.start(remote.environment());
    });

    afterEach(async () => {
      await client.stop();
      remote.cleanUp();
    });

    async function refusal(toolName: string, toolArguments: Record<string, unknown>): Promise<string> {
      const response = await client.callRaw(toolName, toolArguments);
      expect(response.result?.isError).toBe(true);
      return responseText(response);
    }

    async function expectNothingChanged(): Promise<void> {
      expect(await client.call("read_project", { view: "changes" })).toBe("No local changes pending.");
      expect(await client.call("read_file", { path: "main.tex" })).toBe(MAIN_TEX);
    }

    it("refuses to delete Main.tex, which used to delete main.tex", async () => {
      expect(await refusal("manage_files", { action: "delete", path: "Main.tex" })).toBe(
        refusalNaming("Main.tex", "main.tex", "main.tex"),
      );
      await expectNothingChanged();
    });

    it("refuses to write Main.tex, which used to overwrite main.tex", async () => {
      expect(
        await refusal("edit_file", { action: "write", path: "Main.tex", content: "A new file.\n" }),
      ).toBe(refusalNaming("Main.tex", "main.tex", "main.tex"));
      await expectNothingChanged();
    });

    it("refuses to read Main.tex, naming main.tex", async () => {
      expect(await refusal("read_file", { path: "Main.tex" })).toBe(
        refusalNaming("Main.tex", "main.tex", "main.tex"),
      );
    });

    it("refuses a new file under Sections, which would land in sections", async () => {
      expect(
        await refusal("edit_file", { action: "write", path: "Sections/new.tex", content: "New.\n" }),
      ).toBe(refusalNaming("Sections", "sections", "sections/new.tex"));
      expect(
        await refusal("manage_files", { action: "move", path: "main.tex", toPath: "SECTIONS/main.tex" }),
      ).toBe(refusalNaming("SECTIONS", "sections", "sections/main.tex"));
      await expectNothingChanged();
    });

    it("refuses to move a file onto Main.tex, naming main.tex, which does exist", async () => {
      await client.call("edit_file", { action: "write", path: "notes.tex", content: "Notes.\n" });
      expect(await refusal("manage_files", { action: "move", path: "notes.tex", toPath: "Main.tex" })).toBe(
        refusalNaming("Main.tex", "main.tex", "main.tex"),
      );
      expect(await client.call("read_file", { path: "main.tex" })).toBe(MAIN_TEX);
      expect(await client.call("read_file", { path: "notes.tex" })).toBe("Notes.\n");
    });

    it("still reads main.tex at a revision from before a collaborator renamed it Main.tex", async () => {
      const firstDraft = await remote.publishedHeadHash();
      await remote.collaboratorRenames("main.tex", "Main.tex", "Capitalize the main file");

      expect(await client.call("read_file", { path: "Main.tex" })).toBe(MAIN_TEX);
      expect(await refusal("read_file", { path: "main.tex" })).toBe(
        refusalNaming("main.tex", "Main.tex", "Main.tex"),
      );
      expect(await client.call("read_file", { path: "main.tex", revision: firstDraft })).toContain(MAIN_TEX);
    });
  },
);
